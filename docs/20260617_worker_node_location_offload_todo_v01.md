---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Todo: Worker-Node Location Rating Offload (v01)

Phased implementation checklist derived from
[`20260617_worker_node_location_offload_plan_v01.md`](20260617_worker_node_location_offload_plan_v01.md).
Follow [`PLAN_AND_VET.md`](PLAN_AND_VET.md). Read [`AGENTS.md`](../AGENTS.md)
before changing code (logging, error-handling, and commit conventions are
authoritative there).

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
        and prod startup in Phase 4 manual verification** — this is the most
        likely place to break.
- [ ] Decide spawn timing to support warm-up: allow eager spawn (so Phase 3
      can warm at boot) while still being safe if `load()` is the first call.
      Re-spawn lazily on the next `load()` after a crash (see below).
- [ ] Hold a `Map<id, { resolve, reject }>` to correlate `score` responses by
      `id`; generate a unique id per `score()` call.
- [ ] Wrap `load()` in a promise resolved on `{ type: "loaded" }` and rejected
      on `{ type: "error" }`.
- [ ] Handle `{ type: "error", id }` by rejecting the matching pending
      promise (or the in-flight `load()` when no `id`).
- [ ] On worker `error` / `exit` events: reject **all** outstanding promises
      with a clear `Error` (so `processor.ts`'s existing `catch` → `fail(job, error)`
      path surfaces a normal job failure), clear the pending map, and mark the
      worker as needing re-spawn on the next `load()`.
- [ ] Log spawn / exit / error and warm-up lifecycle via the worker-node
      logger (identifiers/counts only).
- [ ] Keep the public surface identical to `createUsLocationClassifier` so it
      is a true drop-in (no changes required in `processor.ts`).

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
        (so the warmed model is the one serving jobs). Expose/return the
        default classifier from the router/app wiring as needed, or construct
        the classifier in `server.ts` and inject it via
        `createApp({ locationClassifier })` — pick the approach that keeps a
        single shared instance and does not double-spawn the worker.
  - [ ] Warm-up failures must be **logged, not fatal**: a failed warm-up must
        not crash the server; the next job retries the load lazily. Add a
        `logInfo` line on warm-up start and on success, and `logError` on
        warm-up failure (identifiers/status only).
- [ ] Sanity-check there is exactly **one** worker thread spawned at runtime
      (warm-up reuses the router's classifier; no duplicate instance).

### Phase 3 gate

Run from `worker-node/`:

- [ ] `npm run type-check`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`

Fix any failures before moving on.

---

## Phase 4 — Worker-node unit tests

Goal: cover the thread-backed classifier's message protocol and promise
correlation without loading a real model.

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
  - [ ] Worker `error`/`exit` rejects all outstanding promises.
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
- [ ] Manual verification confirms no `502`/`fetch failed` on cold first run,
      identical job counts, and intact cancellation / `modelLoading` behavior.
- [ ] Check off completed tasks and commit per `AGENTS.md` commit guidance,
      referencing this todo file and the phase(s) completed.
</content>
</invoke>
