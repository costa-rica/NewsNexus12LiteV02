---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Logging & Error Handling TODO V01 Assessment

## Summary

Assessment is warranted. The TODO mostly follows plan v03, but Phase 6 leaves the portal logger implementation ambiguous in a way that can make the console sweep fail or push the implementer toward a change that contradicts the intended portal logging standard.

## Findings

1. P2. The console sweep conflicts with the current portal logger task.
- Phase 6 says to confirm `portal/src/lib/serverLogger.ts` is the portal standard, then grep for no `console.*` in committed server code.
- The current `portal/src/lib/serverLogger.ts` shim writes to stdout/stderr through `console.error`, `console.warn`, `console.debug`, and `console.info`.
- `AGENTS.md` says portal server-side code should call `serverLogger`, and also says committed server code should not use `console.*`.
- The TODO does not say whether `serverLogger.ts` is the only allowed `console.*` exception, or whether the logger implementation itself must avoid `console.*` by using `process.stdout.write` and `process.stderr.write`.
- An implementer could leave `console.*` in the logger and fail the Phase 6 grep, or rewrite serverLogger without a clear instruction and accidentally change the logger behavior.
- Recommendation: revise Phase 6 to make the intended rule explicit. Prefer requiring `serverLogger.ts` to write structured lines with `process.stdout.write` and `process.stderr.write`, so the no-`console.*` sweep can be literal across committed server code. If a logger-file exception is intended instead, state the exact exception and the grep command should exclude only `portal/src/lib/serverLogger.ts`.

## Recommendation

Create a TODO v02 before implementation. The fix is narrow: clarify the allowed implementation of `portal/src/lib/serverLogger.ts` and make the console-sweep verification unambiguous.
