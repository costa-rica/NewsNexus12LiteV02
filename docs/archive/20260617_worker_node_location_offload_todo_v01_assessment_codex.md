---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO Assessment: Worker-Node Location Rating Offload v01

## Qualifying concern

### 1. `load()` concurrency is ambiguous and can break first-run warm-up semantics

The TODO introduces startup warm-up after the server starts listening, using the
same classifier instance that the router uses (`docs/20260617_worker_node_location_offload_todo_v01.md:155`).
The job processor also calls `classifier.load()` before scoring each job
(`worker-node/src/modules/location-scorer/processor.ts:66`). That means a user
can start a location job while the fire-and-forget warm-up `load()` is still in
flight.

The worker message protocol has no `load` correlation id
(`docs/20260617_worker_node_location_offload_todo_v01.md:57`), and Phase 2 only
says to wrap `load()` in a promise resolved by `{ type: "loaded" }`
(`docs/20260617_worker_node_location_offload_todo_v01.md:114`). It does not
state whether concurrent `load()` calls must be coalesced, queued, or rejected.
An implementing agent could accidentally overwrite the in-flight load resolver,
post duplicate load requests, leave the warm-up promise unresolved, or reject the
job load incorrectly on a no-id worker error.

This directly risks the approved plan's definition of done: startup warm-up
must not disrupt the first user job, and the next job must retry lazily after a
warm-up failure. The TODO should explicitly require deterministic handling for
concurrent `load()` callers, preferably by sharing one in-flight load promise
until it settles, clearing it on failure/worker exit, and adding a unit test for
warm-up `load()` overlapping with a job `load()`.
