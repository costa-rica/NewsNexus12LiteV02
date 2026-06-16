---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Logging & Error Handling Plan V01 Assessment

## Summary

Assessment is warranted. The plan is aligned with the project logging and error-envelope standards in broad shape, but it has a few current-state and ownership ambiguities that could lead to only partial remediation or to implementers working from the wrong baseline.

## Findings

1. P1. The Scrape and worker-node ownership split can leave existing endpoints noncompliant.
- The goal says every existing endpoint will return the standard envelope, including Scrape via Phase 9.
- The scope and risk sections then split ownership so this cycle commits shared infrastructure and Search, while Scrape Phase 9 owns worker routes, portal proxy routes, `jobClient`, and `ScrapeBar`.
- In the current repo, `worker-node` and the scrape proxy routes already exist in the committed history (`feat: add scrape stage worker`). That means these are existing endpoints, not future uncommitted work.
- If this cycle is allowed to finish after only shared infrastructure and Search, the repo can still contain committed worker/proxy endpoints returning legacy shapes like `{ error: "job_not_found" }` and `{ error: "worker_unavailable" }`.
- Recommendation: revise the plan so the logging/errors cycle owns all currently existing endpoints, including worker-node job routes, scrape start-job, portal worker proxy routes, and scrape client error handling. If Scrape Phase 9 remains the tracking surface, make it explicitly part of this remediation cycle and do not mark the cycle complete until those boxes are done.

2. P1. The current-state section mixes working-tree state with committed baseline.
- The plan says `worker-node/src/logger.ts` and `portal/src/lib/serverLogger.ts` are identical console-based shims, but both files are uncommitted working-tree additions right now.
- The committed baseline has `worker-node/src/server.ts` using `console.log` and no committed `worker-node/src/logger.ts` or `portal/src/lib/serverLogger.ts`.
- The risk section also says Scrape is implemented-but-uncommitted, but the current branch has a `feat: add scrape stage worker` commit.
- This matters because a TODO based on the plan may tell an implementer to replace shim internals when the real remediation needs to account for the committed baseline plus in-flight changes.
- Recommendation: revise the plan's current-state and risk sections to distinguish committed code, uncommitted edits, and the intended commit boundary.

3. P2. Worker startup validation needs test and import-order guardrails.
- The plan correctly requires fatal startup validation for `NODE_ENV`, `NAME_APP`, and `PATH_TO_LOGS`.
- If validation lives in the logger module and exits during import, existing worker tests that import app/routes can terminate the test process unless the TODO sets required env vars before imports.
- The missing-env fatal-exit test should run in an isolated child process or equivalent, not inside the main test worker.
- Recommendation: add explicit implementation guidance for `server.ts` import order (`dotenv` first, logger/env validation before app creation), worker test env setup, and isolated fatal-exit tests.

4. P2. The portal proxy body logging gap should be called out directly.
- `portal/src/lib/worker/serverProxy.ts` currently logs `body.slice(0, 500)` for failed worker responses.
- The project standard says not to log full request/response bodies, secrets, full scraped article content, or query payloads; log identifiers, counts, statuses, and failure types instead.
- The plan says details should be logged server-side, which could be misread as permission to keep response-body snippets.
- Recommendation: explicitly require removing response-body snippet logging from the portal proxy and replacing it with method, path, status, error code, and failure type metadata.

## Recommendation

Create a plan v02 before writing the TODO. The v02 should resolve ownership of all existing endpoints, update the baseline facts, and add the validation/test and proxy logging guardrails above.
