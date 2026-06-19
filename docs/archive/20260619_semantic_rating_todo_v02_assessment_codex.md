---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Nexus Semantic Rating TODO V02 Assessment

## Qualifying concern

### Rerun-skipped rows will clear existing semantic ratings

TODO V02 resolves the three V01 assessment concerns, but it introduces a result-contract issue for semantic reruns. The TODO says `skippedIds` contains rows with no usable text **or rerun-skipped rows**, and Phase 3 explicitly instructs the processor to push already-rated rerun rows into `skippedIds`:

```ts
// Result contract
skippedIds: string[]; // ineligible: blank text OR no-text rerun-skip
```

Phase 4 then instructs `applySemanticRatings(scores, skippedIds, failures)` to apply every `skippedId` as:

```ts
semanticRatingMax: null
semanticRatingStatus: "skipped"
```

That means if the user starts semantic rating more than once in the same flow, rows that already have valid in-memory semantic ratings will be skipped by the worker and then cleared by the portal reducer. This conflicts with PRD §5.6 and the approved plan's rerun behavior: already-rated rows should be skipped on rerun unless an explicit rerun/reset action exists, not converted to `N/A` or have their prior scores removed.

This also creates a bad zero-valid terminal path: a rerun where every row was already scored would produce `scores.length === 0`, mark the job `failed`, publish all previously scored rows in `skippedIds`, and the portal would apply those results on the failed terminal status, erasing all semantic ratings and disabling Finish.

The TODO should distinguish "no usable text" skips from "already scored" rerun skips, or instruct the reducer not to clear existing semantic fields for rerun-skipped ids. For example, add an `alreadyScoredIds` channel, omit already-scored rows from terminal results, or make `skippedIds` only mean rows that should display `N/A`. Tests should cover rerunning after a successful semantic run and assert existing scored rows remain unchanged.
