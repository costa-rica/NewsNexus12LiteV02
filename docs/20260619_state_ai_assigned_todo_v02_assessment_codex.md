---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# State (AI Assigned) TODO V02 Assessment

## Qualifying Concerns

1. Rerun skip handling can overwrite completed state assignments.

   V02 resolves the prior id-bearing merge concern with `StateAssignmentResult`, and it resolves the default prompt fallback by requiring `effectivePrompt = state.statePromptDraft ?? defaultPrompt` at run start.

   However, Phase 4 gives conflicting guidance for skipped rows. It says reruns should skip rows already holding a completed assignment (`assigned` / `no_state`), but later says to emit skipped rows as `StateAssignmentResult` entries with `assignment.resultStatus === "skipped"` so cells render `N/A`. If an implementing agent treats already-completed rerun skips as those emitted skipped results, `applyStateAssignments` will replace the existing valid `article.stateAssignment` with `"skipped"`, making a previously populated State cell become `N/A`.

   This risks violating the plan's rerun contract that already-assigned rows are skipped rather than reprocessed, while failed/skipped rows are retried. The TODO should distinguish rows skipped because they lack usable title/content, which may be stored as `"skipped"`, from rows skipped because they already have a completed assignment, which should be counted in run summary if desired but must leave the existing `article.stateAssignment` untouched.
