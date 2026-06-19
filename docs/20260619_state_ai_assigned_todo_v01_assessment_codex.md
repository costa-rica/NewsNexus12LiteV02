---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# State (AI Assigned) TODO V01 Assessment

## Qualifying Concerns

1. `applyStateAssignments` is underspecified because the assignment payload has no article id.

   Phase 1 directs `applyStateAssignments(assignments)` to "merge per-article by id" and write each result to `article.stateAssignment`, while Phase 3 says `assignArticleState(...)` returns a `StateAssignment`. The specified `StateAssignment` shape contains no `articleId`, and the TODO does not define a wrapper such as `{ articleId, assignment }`.

   This risks implementation failure because the reducer cannot reliably merge returned assignments into the correct article row without an id-bearing action payload. An implementing agent could respond by adding `articleId` to `StateAssignment`, inventing a separate action payload, or trying to merge by loop position, all of which are different contracts.

2. The default prompt fallback is clear for the editor but ambiguous for the run trigger.

   Phase 4 says `StatePromptEditor` falls back to `defaultPrompt` when `statePromptDraft` is unset, but `StateBar` is only told to snapshot "the current prompt draft" into `stateRun.promptUsed`. Since `statePromptDraft` is optional and intentionally unset on a new flow/reset/refresh, the TODO does not explicitly tell the run orchestration to resolve `statePromptDraft ?? defaultPrompt` before calling `assignArticleState`.

   This risks violating the PRD requirement that the default prompt always appears on new flows and is used when the user does not edit it. It could also cause the route body validation to fail if the Start button sends an unset prompt template.
