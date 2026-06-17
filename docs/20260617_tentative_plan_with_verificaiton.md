---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Tentative Plan: Location Rating Polling Fix (with Verification Requests)

This plan builds on [`20260617_location_rating_server_polling_issue.md`](20260617_location_rating_server_polling_issue.md)
and Hermes' three proposed options. After discussion on the workstation side, we
are leaning toward going **directly to the clean architectural fix** (Hermes'
Option 3) rather than shipping the retry band-aid first — but a few server-side
facts need to be verified before we commit, because they determine how much the
fix actually buys us and how to size it.

## Chosen direction

**Solution B — isolate model work from the API event loop (Hermes' Option 3),
scoped as "B + warm-up."**

Run the Hugging Face zero-shot classification in a **worker thread** (or separate
child process) so the Express event loop in worker-node stays free and
`/api/worker/jobs/:jobId` polling always responds — eliminating the transient
`502 Bad Gateway` at its root rather than masking it.

Concretely, the plan is three parts:

1. **Offload (core fix).** Move the classifier load + inference off the main
   thread into a worker thread. The classifier is already cleanly isolated behind
   the `LocationClassifier` interface
   (`worker-node/src/modules/location-scorer/classifier.ts`), so the blast radius
   is contained: the worker thread owns `pipeline()` load and `score()`, and the
   processor talks to it via messages. Status endpoints stay responsive while
   inference runs.

2. **Warm-up (makes it *feel* fixed).** Trigger a lightweight model warm-up when
   the worker thread spawns at startup, so the first user-initiated rating job
   does not pay the full model-load cost. This is Hermes' Option 2, folded in —
   nearly free once the thread exists, and it converts "first run is slow but
   works" into "first run is fast."

3. **Thin retry as insurance (optional, cheap).** Keep a small (2–3 attempt)
   backoff on the portal poller for transient `502`/`504`, as cheap insurance
   against a worker-thread crash/restart blip. This is a slimmed Hermes' Option 1.

### Why straight to B instead of Option 1 first

- It is the root-cause fix; we won't have to revisit it.
- Inference is **the same amount of CPU** wherever it runs — B does not add
  computational strain. Its only real cost is **modest memory overhead** (a second
  V8 isolate + the model held in the worker's memory), so the axis to watch is
  **server RAM, not CPU**.
- Even on a small/single-core box, B does not make responsiveness worse: the OS
  scheduler still hands the event loop slices, so polling survives. Worst case is
  a sliver of extra inference time in exchange for a live API — the right trade.

### What B does NOT solve on its own

- The **first-run download/load latency** still exists; warm-up addresses *when*
  it is paid, not *whether*.
- **Re-download on redeploy/restart** (the `PATH_PROJECT_RESOURCES` /
  pre-staged-model idea, our "Solution A") is a separate disk-cache concern. It is
  only worth doing if the on-disk model cache is actually being wiped between
  restarts — which is one of the things we need verified below.

## Verification requested from the server agent

Please confirm the following on the production-style Linux server before we start
implementation. These answers directly change the design and scope.

1. **ONNX backend in use.** Is `@huggingface/transformers` running inference via
   the native `onnxruntime-node` binding or the WASM backend on this server? This
   tells us whether the blocking is truly on the JS thread (which is what makes
   the worker-thread offload the correct fix). The `502` symptom strongly implies
   main-thread blocking, but please confirm.

2. **On-disk model cache persistence.** Where does Transformers.js cache the
   `Xenova/bart-large-mnli` files on the server (e.g. `node_modules/.cache`,
   default cache dir, or elsewhere), and does that directory **survive a service
   restart and a redeploy**? If a redeploy wipes it, the first run includes a full
   re-download and our "Solution A" (pre-staging the model under
   `PATH_PROJECT_RESOURCES`, with remote downloads disabled) becomes worth doing
   alongside B. If it persists, we can skip A.

3. **Available server RAM and core count.** Since B's only real cost is memory (a
   second isolate + model resident in the worker thread), please report the
   worker host's available RAM and vCPU count. This tells us whether a worker
   thread vs. a separate child process is the safer isolation choice and whether
   memory headroom is a concern.

4. **Approximate timings (if available from logs).** Rough wall-clock for (a)
   model download on a cold cache, (b) model load from a warm cache into memory,
   and (c) per-article inference. This helps us set sane warm-up expectations and
   any proxy/poller timeout values.

## Open decisions (pending the answers above)

- Worker **thread** vs separate **child process** — leaning thread for shared
  tooling and lower overhead, but a child process is more robust if the native
  ONNX binding has thread-safety constraints. Server answers #1 and #3 decide
  this.
- Whether to bundle **Solution A** (`PATH_PROJECT_RESOURCES` pre-staging) into
  this cycle or defer it — decided by answer #2.

## Next step

Once the server agent replies, we will turn this tentative plan into a concrete
plan/todo doc (per the lowercase `docs/` convention) and begin implementation.
