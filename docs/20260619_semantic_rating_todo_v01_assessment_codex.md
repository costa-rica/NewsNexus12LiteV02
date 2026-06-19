---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Nexus Semantic Rating TODO V01 Assessment

## Qualifying concerns

### Finish behavior is internally inconsistent and can leave the final stage disabled

The TODO correctly asks for a semantic `canAdvance` clause and a final-stage Finish affordance, but the Phase 5 task describes the recommended Finish change as a "presentational `FlowIndicator` tweak only." In the current code, `FlowIndicator` disables the button with `disabled={!canAdvance || !nextStage}` and `getNextStage("semantic")` returns `undefined`. A label-only change would therefore still render a disabled Finish button even when semantic rating completed with at least one valid score.

This conflicts with the TODO's own completion rule that "Finish enabled" when there is at least one valid rating, and it gives the implementing agent an ambiguous instruction: leave the terminal action disabled because there is no next stage, or enable Finish because the stage is complete.

The TODO should explicitly define the terminal-stage contract. For example: on `semantic`, the button label becomes `Finish`, its disabled state is based on `canAdvance` rather than `nextStage`, and clicking it performs a no-op/finalized state/accessible completed affordance rather than dispatching a next stage. If the intended behavior is to keep the terminal action disabled, the TODO should remove "Finish enabled" and the semantic `canAdvance` task so the implementation is not contradictory.

### Failed row state cannot be populated from the specified worker results

The TODO tells the portal to add `semanticRatingStatus?: "scored" | "skipped" | "failed"` and `semanticRatingError?: string`, and the PRD requires failed or skipped rows to preserve an unset score plus current-run diagnostic status in memory. However, the worker result shape in the TODO remains only:

```ts
SemanticResults = { scores: SemanticScore[]; skippedIds: string[] }
```

Phase 3 says article timeouts and non-timeout article errors should increment `summary.failed`, but it does not require returning failed article ids or failure reasons in `results`. Phase 4 then defines `applySemanticRatings(scores, skippedIds)` only, so the reducer has no way to mark timeout/error rows as `semanticRatingStatus: "failed"` or set `semanticRatingError`. Those rows would likely remain `undefined`, which the table task defines as the "not yet run" empty state rather than `N/A` or a failed current-run status.

This risks breaking the PRD's skipped/failed display semantics, current-run diagnostics, and rerun behavior. The TODO should specify one consistent result contract, such as adding `failedIds` or `failures: { article_id, reason }[]`, or explicitly instructing the processor to include failed/no-score ids in `skippedIds` with a separate status map if row-level distinction is required. The reducer and tests should then apply failed rows to `semanticRatingMax: null`, `semanticRatingStatus: "failed"`, and a sanitized in-memory error/failure type.

### Zero-valid-rating terminal behavior is underspecified in the worker phase

The TODO states that a run with at least one valid rating should complete, and that a model-load failure should fail. It also states in the UI phase that if every row failed or was skipped, the user should stay on the semantic step with a clear failed/empty message. But Phase 3 does not define what terminal job status the processor should set when there are zero valid scores because all rows were blank, skipped, timed out, errored, or produced no valid score.

That leaves an implementing agent to infer whether to call `complete`, `fail`, or neither. Calling `complete` would enable the successful terminal path unless the portal adds extra guards; calling neither can leave polling until timeout; calling `fail` preserves the "stay on step" behavior but must still return any skipped/failed ids for display.

The TODO should explicitly require the processor's zero-valid-score terminal path: set final results for skipped/failed rows, mark the job `failed` or another clearly handled terminal status, and have `SemanticBar` render the empty-result message without enabling Finish. Tests should cover all-skipped/all-failed runs separately from mixed-success runs.
