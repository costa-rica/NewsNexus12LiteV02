---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Nexus Semantic Rating TODO V03 Assessment

## Qualifying concern

### All-already-scored reruns still require model loading

TODO V03 fixes the V02 result-contract bug by separating `alreadyScoredIds` from `skippedIds`, and the reducer no-op for `alreadyScoredIds` should preserve existing ratings. However, Phase 3 still describes the processor pipeline as:

1. classify rows into already-scored / skipped / eligible,
2. embed keywords once,
3. score eligible rows,
4. then compute `validRatings = scores.length + alreadyScoredIds.length`.

That leaves an all-already-scored rerun ambiguous and risky. In that case `eligible.length === 0` and `alreadyScoredIds.length >= 1`, so there is no scoring work to do and the run should complete immediately with the existing ratings preserved. But the TODO still instructs the implementer to load the model and embed keywords before reaching the terminal decision. If the model load fails during this no-work rerun, the TODO's model-load failure rule would mark the job `failed`; the reducer would preserve the ratings, but Finish would become disabled because the semantic run status is failed. That conflicts with the V03 revision note and terminal contract: an all-already-scored rerun must end `completed`, not `failed`, with Finish still enabled.

The TODO should explicitly add a short-circuit after the load/classification step:

- if `eligible.length === 0`, publish `{ scores, skippedIds, alreadyScoredIds, failures }` without loading the model or embedding keywords;
- if `alreadyScoredIds.length >= 1`, complete the job;
- if `alreadyScoredIds.length === 0`, fail the zero-valid run after publishing skipped/failed results.

The Phase 3 processor tests should assert that an all-already-scored rerun does not call `load()` or embed keywords/articles, ends `completed`, and leaves Finish enabled through the portal gating path.
