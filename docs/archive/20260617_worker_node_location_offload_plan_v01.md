---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: Worker-Node Location Rating Offload (v01)

## Roadmap context

This is a **hardening fix within Cycle 4 (Location rating, §3)** of the 6-cycle
build, not a new cycle. Location rating already ships; this plan removes the
`502`/`fetch failed` polling failure documented in
[`20260617_location_rating_server_polling_issue.md`](20260617_location_rating_server_polling_issue.md).
It reuses the existing start-job/poll abstraction and the in-memory job registry,
keeps all pipeline data ephemeral, and adds no durable persistence or queue. The
worker-node stays single-process / one-user-at-a-time; we are only changing
*where* the Hugging Face model work runs inside that process.

## Problem recap

On the production Linux server, the first location rating job after a worker
restart loads `Xenova/bart-large-mnli` and runs zero-shot inference on the main
Node thread. That work blocks the Express event loop long enough that a
`/api/worker/jobs/:jobId` poll returns `502 Bad Gateway`, so the browser shows
`fetch failed` even though the job completes successfully. The fix is to keep the
event loop free during model load + inference.

## Decisions confirmed by the server agent (Hermes)

These came back from the verification requests in
[`20260617_tentative_plan_with_verificaiton.md`](20260617_tentative_plan_with_verificaiton.md)
and are baked into this plan:

- **Isolation mechanism: worker thread** (not a child process). The boundary is
  kept narrow so a swap to a child process stays cheap if native ONNX proves
  unstable under thread isolation.
- **Backend:** `onnxruntime-node` (native) is installed and reported available.
- **Host:** 2 vCPUs, ~4.8 GiB available RAM. The model is ~395 MiB on disk; one
  resident copy in the worker thread fits comfortably.
- **Solution A (`PATH_PROJECT_RESOURCES` pre-staging) is deferred.** The on-disk
  cache (`worker-node/node_modules/@huggingface/transformers/.cache/Xenova/bart-large-mnli`)
  survives ordinary restarts. It is out of scope here; revisit only if a redeploy
  is confirmed to wipe the cache.

## Goal / definition of done

1. Location rating jobs run the model load + every `score()` call **off the main
   event loop**, so `/api/worker/jobs/:jobId` keeps responding (no `502`) even
   during a cold first run.
2. The model is **warmed at worker startup** so the first user job does not pay
   the full load cost interactively.
3. Job semantics are unchanged: progress updates, the `modelLoading` summary flag,
   cancellation, "never partially write on failure," and result shape all behave
   exactly as today.
4. The portal poller tolerates a transient `502`/`504` with a small bounded retry
   (cheap insurance against a worker-thread restart blip).

## Technology

- **`node:worker_threads`** — a single long-lived worker thread owns the
  Transformers.js pipeline. No new dependencies.
- **`@huggingface/transformers`** — unchanged; the existing
  `createUsLocationClassifier` runs *inside* the thread.
- **Existing in-memory job registry + Express start-job/poll routes** — unchanged.
- **Portal poll client (Next.js)** — small retry/backoff addition only.

## Design overview

The clean seam is the existing `LocationClassifier` interface
(`worker-node/src/modules/location-scorer/types.ts`):

```ts
interface LocationClassifier {
  load(): Promise<void>;
  score(text: string): Promise<number>;
}
```

We introduce a **second implementation** of this interface that proxies to a
worker thread, leaving `processor.ts`, `routes.ts`, and `app.ts` essentially
untouched. The processor still calls `classifier.load()` then `classifier.score()`
per article — it just no longer blocks the event loop while doing so.

### Components

1. **Worker entry (`location-scorer/classifier.worker.ts`)**
   - Runs inside the thread. On startup it builds the real classifier via the
     existing `createUsLocationClassifier(loadLocationScorerConfig())`.
   - Listens for messages: `{ type: "load" }` and
     `{ type: "score", id, text }`.
   - Replies with `{ type: "loaded" }` / `{ type: "score-result", id, score }`
     and `{ type: "error", id?, message }` on failure.
   - Logs through the worker-node Winston logger per the project logging
     convention (the logger is initialized inside the thread too).

2. **Thread-backed classifier (`location-scorer/threadClassifier.ts`)**
   - Implements `LocationClassifier` on the main thread.
   - Spawns the worker thread once (lazily on first `load()`, or eagerly at
     startup for warm-up — see below), holds a `Map<id, {resolve, reject}>` to
     correlate `score` responses, and forwards `load()`/`score()` as messages.
   - Wraps each request in a `Promise` and rejects on worker `error`/`exit`.
   - Exposes the same `load()`/`score()` signatures so it is a drop-in for
     `createUsLocationClassifier`.

3. **Wiring (`app.ts` / `server.ts`)**
   - `createLocationScorerRouter` keeps accepting an injectable `classifier`
     (already does), so tests can still pass a fake and avoid spawning threads.
   - When no classifier is injected, default to the thread-backed implementation
     instead of the in-process one.
   - **Warm-up:** after the server starts listening (`server.ts`), kick off a
     fire-and-forget `classifier.load()` so the model loads in the thread at boot.
     Warm-up failures are logged but must not crash the server (the next job will
     retry the load lazily).

4. **Portal poller retry (portal client)**
   - Where the UI polls `/api/worker/jobs/:jobId`, treat a `502`/`504` (or network
     `fetch failed`) as transient while the job is still expected to be running:
     retry ~2–3 times with short backoff before surfacing an error. This is a
     slim version of Hermes' Option 1, kept as insurance.

### Message flow (per job)

```
processor.runLocationJob
  -> classifier.load()            (main thread)
       -> postMessage {load}      -> worker builds/ensures pipeline
       <- {loaded}                <- resolves load()
  -> for each eligible article:
       classifier.score(text)
         -> postMessage {score,id,text}
         <- {score-result,id,score}  (event loop free the whole time)
```

The event loop on the main thread stays idle-but-responsive throughout, so
concurrent `/jobs/:jobId` polls answer immediately.

## Concurrency & lifecycle notes

- **One worker thread, sequential scoring.** This matches the existing
  one-user-at-a-time / sequential-processing architecture; we do not add a pool.
  Inference still runs one article at a time, just on the other thread.
- **Cancellation.** `processor.ts` already checks `job.abortController.signal`
  between articles and stops issuing new `score()` calls. That behavior is
  preserved unchanged; we do not need to interrupt an in-flight single inference.
- **Crash recovery.** If the worker thread exits unexpectedly, the thread-backed
  classifier rejects outstanding promises (surfacing a normal job failure via the
  existing `fail(job, error)` path) and re-spawns lazily on the next `load()`.
- **Memory.** One resident model (~395 MiB) in the worker thread; well within the
  ~4.8 GiB available. No second copy on the main thread once we default to the
  thread-backed classifier.

## Out of scope

- Solution A / `PATH_PROJECT_RESOURCES` pre-staging (deferred per Hermes).
- Any change to the model, dtype, labels, scoring math, or result shape.
- Worker pools / parallel inference / durable queue (contrary to architecture).
- Raising reverse-proxy upstream timeouts (deployment-side; can be a follow-up,
  not part of this code change).

## Testing strategy

- **Unit (vitest, existing patterns):** `processor.ts` tests already inject a fake
  `LocationClassifier`; keep them. Add a test for `threadClassifier` that asserts
  the load/score message protocol and promise correlation using a stubbed
  message port (no real model load in unit tests).
- **No real-model unit tests** — model load is too heavy for CI; keep it behind
  the injectable seam.
- **Manual server verification:** restart the worker, immediately start a location
  job, and confirm (a) `/jobs/:jobId` polls keep returning 200 throughout the cold
  first run, (b) the job completes with the same eligible/processed/skipped
  counts, and (c) the warm-up log line appears at boot.
- Phase gates run type-check, lint, tests, and build per the plan-and-vet
  convention.

## Known unknown to confirm during implementation/testing

- **Exact load vs inference timings** were not provided (logs didn't have them).
  They do not change the architecture — the thread offloads both — but we should
  capture rough wall-clock for cold load and per-article inference during manual
  verification, to set sensible warm-up expectations and to inform any later
  proxy-timeout tuning.

## Next step

Submit this plan (v01) for assessment per
[`PLAN_AND_VET.md`](PLAN_AND_VET.md). Once it has no qualifying concerns, produce
a phased todo list (this is multi-step, so a todo is warranted — not a trivial
≤5-line change) and vet that before implementation.
