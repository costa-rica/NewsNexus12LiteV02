---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
supersedes: 20260617_worker_node_location_offload_todo_v01.md
---

# Todo: Worker-Node Location Rating Offload (v02)

Phased implementation checklist derived from
[`20260617_worker_node_location_offload_plan_v01.md`](20260617_worker_node_location_offload_plan_v01.md).
Follow [`PLAN_AND_VET.md`](PLAN_AND_VET.md). Read [`AGENTS.md`](../AGENTS.md)
before changing code (logging, error-handling, and commit conventions are
authoritative there).

## What changed from v01

This revision addresses the qualifying concern raised in
[`20260617_worker_node_location_offload_todo_v01_assessment_codex.md`](20260617_worker_node_location_offload_todo_v01_assessment_codex.md):
the startup warm-up `load()` and a first user-job `load()` can be **in flight at
the same time**, and v01 never said how concurrent `load()` callers are handled.
v02 makes that deterministic (a single shared in-flight load promise), requires
clearing that state on failure / worker exit so a later job can retry lazily, and
adds explicit unit coverage for the overlapping-warm-up-vs-job case. See the
**bolded `[concurrency]` items in Phase 2** and the new **Phase 4 overlap test**.
No plan scope changed.

## Scope guardrails (read before starting)

These constraints come straight from the approved plan. Do **not** exceed them:

- **Core fix:** move the model load + every `score()` call off the main Node
  event loop using `node:worker_threads`. Startup warm-up and a small portal
  poll retry are the only additional pieces.
- **No new dependencies.** Use the built-in `node:worker_threads`;
  `@huggingface/transformers` and the existing job registry / Express routes are
  unchanged.
- **Do NOT** add: a durable queue, any database/schema change, a worker pool /
  parallel inference, or Solution A / `PATH_PROJECT_RESOURCES` pre-staging.
- **Do NOT** change the model, dtype, labels, scoring math, or result shape.
- **Preserve job semantics exactly:** progress updates, the `modelLoading`
  summary flag transitions, cancellation between articles, "never partially
  write on failure," and the result shape (`LocationResults`).
- **Keep the worker boundary narrow** (small message protocol: `load`,
  `score`, `loaded`, `score-result`, `error`) so a later swap to a child
  process stays cheap.
- The thread-backed classifier must implement the existing
  `LocationClassifier` interface
  (`worker-node/src/modules/location-scorer/types.ts`) so `processor.ts`,
  `routes.ts`, and the injectable-classifier seam are essentially untouched.
- **Concurrent `load()` is coalesced, not redesigned.** The dedupe described in
  Phase 2 is a single shared in-flight promise on the existing main-thread
  classifier — it does **not** introduce a queue, a load correlation id in the
  wire protocol, or a second worker. The five message types above stay as-is.

---

## Phase 1 — Worker thread entry (the model runs here)

Goal: a long-lived worker thread that owns the existing Transformers.js
classifier and speaks a tiny message protocol.

- [ ] Create `worker-node/src/modules/location-scorer/classifier.worker.ts`.
- [ ] Initialize the worker-node Winston logger **first** inside the thread
      (per `AGENTS.md` / `docs/LOGGING_NODE_JS_V08.md`): the logger is a
      singleton initialized before other app code, and it runs in a separate
      thread context here. Use `logInfo`/`logError` from
      `worker-node/src/logger.ts` — no `console.*`.
- [ ] In the worker, build the real classifier once via
      `createUsLocationClassifier(loadLocationScorerConfig())` (from
      `./classifier.js` and `./config.js`). Reuse the existing lazy
      `ensureLoaded` behavior — do not duplicate the pipeline-building logic.
- [ ] Define and handle the inbound message protocol via `parentPort`:
  - [ ] `{ type: "load" }` → `await classifier.load()` then reply
        `{ type: "loaded" }`; on failure reply
        `{ type: "error", message }`.
  - [ ] `{ type: "score", id, text }` → `await classifier.score(text)` then
        reply `{ type: "score-result", id, score }`; on failure reply
        `{ type: "error", id, message }` (include the `id` so the main thread
        can reject the right pending promise).
  - [ ] The worker may receive multiple `{ type: "load" }` messages over its
        lifetime (e.g. a lazy re-spawn after a crash). Because it delegates to
        the classifier's existing idempotent `ensureLoaded`, a repeat `load`
        after a successful load is cheap and still replies `{ type: "loaded" }`.
        The main thread (Phase 2) is responsible for not *needlessly* sending a
        duplicate `load` while one is already in flight — keep the worker simple
        and idempotent.
- [ ] Keep the message types in one place so the main-thread classifier
      (Phase 2) imports/reuses the same shapes (e.g. a small exported
      `type WorkerRequest` / `type WorkerResponse` union — colocated in the
      worker file or a sibling `classifier.worker.types.ts`). Keep it minimal.
- [ ] Ensure the worker never logs secrets or full article content — log
      identifiers/counts/statuses only (`AGENTS.md` logging rules). The `text`
      payload is article-derived input; do not log its contents.
- [ ] Confirm a single resident model in the thread (no second load path on
      the main thread once Phase 3 defaults to the thread-backed classifier).

### Phase 1 gate

Run from `worker-node/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on. (Phase 1 adds a new file and types but no
behavior wiring yet, so unit tests should still pass unchanged.)

---

## Phase 2 — Thread-backed classifier (main-thread proxy)

Goal: a drop-in `LocationClassifier` that forwards `load()`/`score()` to the
worker thread and correlates responses, leaving `processor.ts` logic untouched.

- [ ] Create
      `worker-node/src/modules/location-scorer/threadClassifier.ts` exporting
      a factory (e.g. `createThreadLocationClassifier(config)`) that returns a
      `LocationClassifier` (`load(): Promise<void>`, `score(text): Promise<number>`).
- [ ] Spawn exactly **one** worker thread (`new Worker(...)`). Resolve the
      worker entry path so it works in **both** runtimes:
  - dev: `tsx watch src/server.ts` runs TypeScript directly;
  - prod: `npm run build` (`tsc`) emits `dist/**/*.js` and `npm start` runs
        `node dist/server.js`.
  - [ ] Choose and document the resolution approach (e.g. resolve relative to
        the current module via `import.meta.url` with a `.js` specifier to
        match the NodeNext `.js`-import convention used across the codebase,
        and verify tsx resolves the `.ts` sibling in dev). **Verify both dev
        and prod startup in Phase 6 manual verification** — this is the most
        likely place to break.
- [ ] Decide spawn timing to support warm-up: allow eager spawn (so Phase 3
      can warm at boot) while still being safe if `load()` is the first call.
      Re-spawn lazily on the next `load()` after a crash (see below).
- [ ] Hold a `Map<id, { resolve, reject }>` to correlate `score` responses by
      `id`; generate a unique id per `score()` call.

### `[concurrency]` Deterministic concurrent `load()` handling (addresses Codex concern)

The startup warm-up (Phase 3) fires `load()` fire-and-forget right after the
server starts listening, while `processor.ts` calls `classifier.load()` before
scoring each job (`worker-node/src/modules/location-scorer/processor.ts`). These
two `load()` calls **can overlap**. The wire protocol carries **no load
correlation id**, so a single shared in-flight promise on the main-thread
classifier is the correctness boundary — handle it deterministically:

- [ ] **[concurrency] Share one in-flight load promise.** Keep a single nullable
      field (e.g. `loadPromise: Promise<void> | null`). The first `load()` call
      sends exactly one `{ type: "load" }` to the worker and stores the promise;
      every concurrent `load()` caller returns that **same** promise. Do **not**
      post a second `load` message, and do **not** overwrite/replace the resolver
      while a load is in flight. Both the warm-up caller and the job caller must
      observe the same settle.
- [ ] **[concurrency] Resolve/reject all waiters together.** On
      `{ type: "loaded" }` resolve the shared promise (all current waiters
      resolve); on a no-`id` `{ type: "error" }` reject the shared promise (all
      current waiters reject with the same `Error`). There is exactly one
      in-flight `load` resolver at a time — there is no second resolver to
      clobber.
- [ ] **[concurrency] Clear in-flight load state on failure.** When the shared
      load promise **rejects** (worker `{ type: "error" }` with no `id`, or a
      worker `error`/`exit` during load), reset `loadPromise` back to `null` so a
      later `load()` (e.g. the next job after a failed warm-up) starts a **fresh**
      load and retries lazily — this preserves the plan's "next job retries the
      load lazily" definition of done.
- [ ] **[concurrency] Clear in-flight load state on worker exit/crash.** On
      worker `exit`/`error`, in addition to rejecting outstanding `score`
      promises, reject and **null out** any in-flight `loadPromise` and mark the
      worker as needing re-spawn, so the next `load()` re-spawns and re-issues a
      single `load`. After a **successful** load, decide and document whether
      `loadPromise` stays resolved (so repeat `load()` calls are no-ops) — it
      must remain consistent with the worker's idempotent `ensureLoaded`.
- [ ] **[concurrency] Distinguish `load` errors from `score` errors.** A worker
      `{ type: "error" }` **with** an `id` rejects the matching pending `score`
      promise only; a worker `{ type: "error" }` **without** an `id` rejects the
      shared `loadPromise` only. Never let a no-id error reject a `score`
      promise, and never let an id'd score error reject the in-flight load.

- [ ] Handle `{ type: "error", id }` by rejecting the matching pending
      `score` promise (see the `[concurrency]` rule above for the no-`id` /
      load case).
- [ ] On worker `error` / `exit` events: reject **all** outstanding promises
      (pending `score`s **and** any in-flight `loadPromise`) with a clear
      `Error` (so `processor.ts`'s existing `catch` → `fail(job, error)` path
      surfaces a normal job failure), clear the pending map, **null the
      `loadPromise`**, and mark the worker as needing re-spawn on the next
      `load()`.
- [ ] Log spawn / exit / error and warm-up lifecycle via the worker-node
      logger (identifiers/counts only).
- [ ] Keep the public surface identical to `createUsLocationClassifier` so it
      is a true drop-in (no changes required in `processor.ts`). The in-flight
      load dedupe is an internal implementation detail of the classifier — it
      does **not** change the `LocationClassifier` interface.

### Phase 2 gate

Run from `worker-node/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on.

---

## Phase 3 — Wiring + startup warm-up

Goal: default production wiring to the thread-backed classifier and warm the
model at boot, without disturbing the injectable test seam.

- [ ] In `worker-node/src/modules/location-scorer/routes.ts`: when no
      classifier is injected (`options.classifier` is undefined), default to
      the **thread-backed** classifier
      (`createThreadLocationClassifier(config)`) instead of
      `createUsLocationClassifier(config)`. Keep accepting an injected
      `classifier` unchanged so tests still pass a fake and never spawn a
      thread.
- [ ] Confirm `worker-node/src/app.ts` still threads
      `options.locationClassifier` through to the router unchanged (the
      injectable seam stays intact for `createApp` callers).
- [ ] Add startup warm-up in `worker-node/src/server.ts`: after the server is
      listening, kick off a **fire-and-forget** `classifier.load()` so the
      model loads in the thread at boot.
  - [ ] The warm-up must use the **same** classifier instance the router uses
        (so the warmed model is the one serving jobs, **and** so the shared
        in-flight load promise from Phase 2 actually coalesces the warm-up load
        with a first job's load). Expose/return the default classifier from the
        router/app wiring as needed, or construct the classifier in `server.ts`
        and inject it via `createApp({ locationClassifier })` — pick the
        approach that keeps a single shared instance and does not double-spawn
        the worker. A separate classifier instance would **defeat** the Phase 2
        dedupe and re-introduce the overlapping-load bug, so this is mandatory.
  - [ ] Warm-up failures must be **logged, not fatal**: a failed warm-up must
        not crash the server; the next job retries the load lazily (this relies
        on the Phase 2 "clear in-flight load state on failure" rule). Add a
        `logInfo` line on warm-up start and on success, and `logError` on
        warm-up failure (identifiers/status only).
- [ ] Sanity-check there is exactly **one** worker thread spawned at runtime
      (warm-up reuses the router's classifier; no duplicate instance) and that
      a first job started while warm-up is still loading does **not** trigger a
      second `{ type: "load" }` message.

### Phase 3 gate

Run from `worker-node/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on.

---

## Phase 4 — Worker-node unit tests

Goal: cover the thread-backed classifier's message protocol, promise
correlation, and **deterministic concurrent `load()` handling**, without
loading a real model.

- [ ] Add `worker-node/src/modules/location-scorer/threadClassifier.test.ts`
      following existing vitest patterns (see
      `classifier.test.ts` for `vi.hoisted` / `vi.mock` usage and the
      vitest env in `vitest.config.ts`).
- [ ] Stub the worker/message port (mock `node:worker_threads` `Worker` with a
      fake that captures `postMessage` and lets the test emit
      `message`/`error`/`exit`). **Do not load the real model** in unit tests.
- [ ] Assert:
  - [ ] `load()` resolves on `{ type: "loaded" }`.
  - [ ] `score(text)` posts `{ type: "score", id, text }` and resolves with
        the score from the matching `{ type: "score-result", id, score }`.
  - [ ] Out-of-order `score-result`s resolve the correct pending promise
        (id correlation).
  - [ ] `{ type: "error", id }` rejects the matching `score()`; an error
        without `id` rejects an in-flight `load()`.
  - [ ] Worker `error`/`exit` rejects all outstanding promises (pending
        `score`s **and** an in-flight `load()`).

### `[concurrency]` Overlapping warm-up vs. job `load()` coverage (addresses Codex concern)

- [ ] **[concurrency] One worker load request for concurrent callers.** Call
      `load()` twice **before** the worker replies (simulating warm-up +
      first-job overlap). Assert exactly **one** `{ type: "load" }` message was
      posted to the worker, and that **both** returned promises resolve when the
      single `{ type: "loaded" }` arrives.
- [ ] **[concurrency] Both callers reject consistently on load failure.** With
      two overlapping `load()` calls in flight, emit a no-`id`
      `{ type: "error" }` (or a worker `error`/`exit`) and assert **both**
      returned promises reject with the same error — and that no pending
      `score` promise is affected.
- [ ] **[concurrency] Lazy retry after a failed load.** After a load rejection
      clears the in-flight state, assert a subsequent `load()` posts a **new**
      `{ type: "load" }` (i.e. the in-flight promise was cleared, not stuck) and
      can resolve normally.
- [ ] **[concurrency] Re-spawn + reload after worker exit.** After a worker
      `exit` while a load is in flight, assert the in-flight `load()` rejected,
      `loadPromise` was cleared, and the next `load()` re-spawns / re-issues a
      single `{ type: "load" }`.
- [ ] Keep existing `processor.ts` tests (they inject a fake
      `LocationClassifier`) **unchanged and passing** — they are the guarantee
      that job semantics (progress, `modelLoading` flag, cancellation, no
      partial write) are preserved.

### Phase 4 gate

Run from `worker-node/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on.

---

## Phase 5 — Portal poll retry (insurance)

Goal: tolerate a transient `502`/`504`/`fetch failed` during polling while the
job is still expected to be running. This is a slim retry, not a redesign.

- [ ] In `portal/src/lib/worker/jobClient.ts`, update the polling path
      (`pollJob` → `getJob`) so a transient failure while polling a
      not-yet-terminal job is retried ~2–3 times with short backoff before
      surfacing the error.
  - [ ] Treat as transient: HTTP `502` and `504`
        (`WorkerRequestError.status`), and network `fetch failed`
        (a thrown `TypeError`/non-`WorkerRequestError` from `fetch`).
  - [ ] Do **not** retry genuine terminal/client errors (e.g. `404`/`400`,
        or a `failed`/`cancelled` job status) — only the transient blip.
  - [ ] Keep the existing `pollJob` interface, `onUpdate` callback behavior,
        `maxAttempts`/`intervalMs` semantics, and the overall poll timeout
        intact; the retry is bounded and additive.
- [ ] Respect the portal logging convention (`AGENTS.md`): this is client/
      shared code — no `console.*` noise; only intentional, guarded dev
      diagnostics if any.
- [ ] Update/add tests in
      `portal/src/lib/worker/jobClient.test.ts` covering: a transient
      `502`/`504`/`fetch failed` that recovers on retry, and a non-transient
      error that surfaces immediately (no retry).

### Phase 5 gate

Run from `portal/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on.

---

## Phase 6 — Manual server verification (production-like)

Goal: confirm the event loop stays responsive on a cold first run and that job
semantics are unchanged. Capture the timings the plan flagged as a known
unknown.

> No automated commands assert these; perform them manually on a
> production-like Linux run (`npm run build` then `npm start` for worker-node,
> and the portal pointed at it). Record observations in the PR / a notes file.

- [ ] Restart the worker-node and confirm the **warm-up log line** appears at
      boot (warm-up start + success), and that a warm-up failure (if forced)
      is logged but does **not** crash the server.
- [ ] **[concurrency] Overlap check.** Immediately after restart — while warm-up
      is still loading — start a location rating job and confirm a **single**
      model load occurs (one worker load lifecycle in the logs, not two) and the
      job proceeds normally once the shared load settles.
- [ ] Immediately after restart, start a location rating job and confirm
      `/api/worker/jobs/:jobId` polls keep returning **200** throughout the
      cold first run (no `502`/`fetch failed`).
- [ ] Confirm the job completes with the **same** `eligible` / `processed` /
      `skipped` counts as before the change, and the `modelLoading` summary
      flag transitions 0 → 1 → 0 as today.
- [ ] Confirm cancellation between articles still stops the job promptly and
      does not partially write results.
- [ ] Verify the worker entry path resolves in **both** dev (`npm run dev` /
      tsx) and prod (`npm run build` + `npm start`) — this is the Phase 2 risk
      area.
- [ ] Capture rough wall-clock for cold model load and per-article inference
      (the plan's known unknown) to inform warm-up expectations and any later
      proxy-timeout tuning. These do not change the architecture.

### Phase 6 gate

- [ ] Re-run full gates in both packages to confirm nothing regressed:
  - From `worker-node/`: `npm run type-check`, `npm run lint`,
        `npm run test`, `npm run build`.
  - From `portal/`: `npm run type-check`, `npm run lint`, `npm run test`,
        `npm run build`.

Fix any failures before considering the work done.

---

## Completion

- [ ] All phase gates pass in both `worker-node` and `portal`.
- [ ] Concurrent `load()` is deterministic: a single shared in-flight load
      promise coalesces warm-up + first-job loads, the state clears on
      failure/worker exit for lazy retry, and the Phase 4 overlap tests pass.
- [ ] Manual verification confirms no `502`/`fetch failed` on cold first run,
      a single model load when a job overlaps warm-up, identical job counts, and
      intact cancellation / `modelLoading` behavior.
- [ ] Check off completed tasks and commit per `AGENTS.md` commit guidance,
      referencing this todo file and the phase(s) completed.
