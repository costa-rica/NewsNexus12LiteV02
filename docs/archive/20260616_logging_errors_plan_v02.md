---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Logging & Error Handling — Plan V02

> **Changes from V01** (resolves `docs/20260616_logging_errors_plan_v01_assessment_codex.md`):
> 1. **Ownership** (P1): this cycle now owns **all currently existing endpoints** — Search,
>    the committed worker job routes + scrape `start-job`, and the committed portal proxy +
>    scrape client. The V01 "defer scrape to Phase 9" split is removed: scrape is already
>    committed (non-compliant), so its retrofit is owned here.
> 2. **Baseline facts** (P1): current-state corrected to distinguish committed code,
>    uncommitted working-tree edits, and the commit boundary.
> 3. **Worker startup validation** (P2): added import-order, test-env, and isolated
>    fatal-exit test guardrails.
> 4. **Portal proxy logging** (P2): explicitly remove the response-body snippet log; log
>    metadata only.

## What this is (and is not)

A **cross-cutting remediation cycle**, not one of the 6 product stages. It (1) stands up the
shared logging + error-handling infrastructure each app needs, and (2) retrofits **all code
that already exists** to the project standard. It does **not** add any stage 4–6 feature work.

- **Standard**: `AGENTS.md` "Logging" + "Error Handling", backed by
  `docs/LOGGING_NODE_JS_V08.md` and `docs/ERROR_REQUIREMENTS.md` (authoritative).
- **Future stages** comply by reusing the infra this cycle builds + the `AGENTS.md` refs
  already in the open TODOs.

## Goal

After this cycle: worker-node logs via a compliant Winston logger; the portal logs via
`serverLogger`; both apps have a shared error-envelope helper; and **every existing
endpoint** (Search, worker job routes, scrape `start-job`, portal proxy routes) returns the
standard `{ error: { code, message, details?, status } }` envelope with detail logged
server-side and no full bodies/secrets logged.

## Current state (verified against git, 2026-06-16)

**Committed baseline** (`HEAD` = `1ecd31c feat: add scrape stage worker`, on top of
`5fb94fb feat: add google rss search`):

- `worker-node/` exists and is committed: generic job routes (`GET /jobs/:jobId`,
  `POST /jobs/:jobId/cancel`), scrape `start-job`, `server.ts`. The committed `server.ts`
  uses `console.log`; there is **no committed logger module**.
- Committed endpoints return **legacy error shapes**, e.g. `{ error: "job_not_found" }` and
  the portal proxy's `{ error: "worker_unavailable" }` (status 502).
- `portal/src/lib/worker/serverProxy.ts` is committed and logs `body.slice(0, 500)` of failed
  worker responses (violates the no-full-bodies rule).
- Search route + `SearchBar` (committed) use `{ success, errorCode, error }`.

**Uncommitted working-tree edits** (in flux from parallel work — coordinate before editing):

- `worker-node/src/logger.ts` and `portal/src/lib/serverLogger.ts` are **untracked** —
  identical console-based shims (`logDebug/info/warn/error`, `LOG_LEVEL`).
- Modified-but-uncommitted: `worker-node/src/server.ts` (now imports `logInfo`), plus
  `runner.ts`, `enrichment.ts`, scrape `routes.ts`, `serverProxy.ts`, `jobClient.ts`,
  `ScrapeBar.tsx`, and both `.env.example` files.

**Commit boundary**: this cycle lands as its **own follow-up commit(s)** on top of the
committed scrape worker — it is a retrofit of committed code plus the new shared infra, not a
pre-commit gate. (worker-node is a single process — the doc's `NAME_CHILD_PROCESS_*` does not
apply.)

## Scope

**In scope — own all existing endpoints + infra**

1. Shared infrastructure: worker-node compliant Winston logger; portal `serverLogger`
   confirmed as the Next.js logger; an error-envelope helper in each app.
2. Retrofit every existing endpoint and its consumers to the envelope + logger:
   - portal: Search route; worker **proxy routes** + `serverProxy.ts`.
   - worker-node: `GET /jobs/:jobId`, `POST /jobs/:jobId/cancel`, scrape `start-job`,
     health.
   - consumers: `SearchBar`, `ScrapeBar`, `jobClient` (read the envelope on error).
   - reconcile the two ad-hoc logger shims into the standard.

**Out of scope**

- Any stage 4–6 (Location/State/Semantic) feature logic.
- Winston/daily-rotate in the portal (the logging doc excludes Next.js).
- Changing success-response payloads (only **error** branches change).
- Durable log shipping/aggregation beyond the daily-rotate files the doc specifies.

## Relationship to Scrape's Phase 9

Scrape TODO Phase 9 was written as a "blocks the stage-3 commit" gate when scrape looked
uncommitted. Scrape is now committed, so that gate is overtaken by events. **This cycle
executes and owns the scrape endpoint/logging retrofit.** When this cycle's TODO is created,
note that completing it satisfies/closes scrape Phase 9 (the scrape retrofit is not done
twice).

## Approach

### worker-node logging (compliant)

- Replace the internals of `worker-node/src/logger.ts` with Winston +
  `winston-daily-rotate-file`, **keeping the `logInfo/logWarn/logError/logDebug` export
  surface** so call sites are unaffected. Install `winston`, `winston-daily-rotate-file`.
- Singleton initialized before other app code; mode by `NODE_ENV` (development=console,
  testing=console+files, production=files); dated `{NAME_APP}-YYYY-MM-DD.log`;
  `LOG_MAX_SIZE`/`LOG_MAX_FILES`.
- **Startup env validation** with guardrails (P2):
  - `server.ts` import order: `dotenv` first, then logger/env validation, then `createApp()`.
  - Fatal-exit (stderr + `process.exit(1)`) if `NODE_ENV`/`NAME_APP`/`PATH_TO_LOGS` missing,
    with the doc's flush-before-exit delay.
  - Validation must **not** terminate the test process on import: tests set required env vars
    before importing app/routes, and the missing-env fatal-exit case is tested in an
    **isolated child process**, not the main test worker.

### portal logging (Next.js)

- Keep `serverLogger.ts` as the portal standard (structured lines to stdout/stderr),
  server-side only, no Winston.

### Shared error-envelope helper (both apps)

- worker-node: `src/http/errors.ts` — envelope builder + Express error middleware that logs
  detail via the logger and returns the sanitized envelope; `details` only when
  `NODE_ENV === "development"`.
- portal: `src/lib/http/errors.ts` — `errorJson({ code, message, status, details? })`
  returning `NextResponse.json({ error: {...} }, { status })`; logs via `serverLogger`.

### Error-code mapping (apply consistently)

| Case | code | status |
|---|---|---|
| blank query / invalid body | `VALIDATION_ERROR` | 400 |
| Google News 503 (rate/unavailable) | `SERVICE_UNAVAILABLE` | 503 |
| RSS parse / unexpected server failure | `INTERNAL_ERROR` | 500 |
| unknown job id (`GET /jobs/:id`, cancel) | `NOT_FOUND` | 404 |
| worker unreachable from portal proxy | `SERVICE_UNAVAILABLE` | 503 |

(503 chosen for Google + worker-unreachable to match upstream/doc; `RATE_LIMIT_EXCEEDED` 429
and a 502 for the proxy case are the alternatives — finalize at TODO time. Replaces the
legacy `job_not_found` / `worker_unavailable` shapes.)

### Portal proxy logging fix (P2)

- Remove the `body.slice(0, 500)` response-body log from `serverProxy.ts`. On a failed worker
  response, log **metadata only**: method, path, upstream status, error `code`, and failure
  type. Never log response/request bodies, query payloads, or scraped content.

### Consumer ripple

Changing the **error** shape breaks clients reading `data.success`/`data.errorCode` or the
legacy `{ error: "..." }` string:

- `SearchBar.tsx`: failure handling → "non-2xx → show `data.error.message`"; update
  `route.test.ts` and `SearchBar.test.tsx`.
- `jobClient.ts` / `ScrapeBar.tsx`: read `data.error` envelope (not `error: "worker_unavailable"`).
- Split the `GoogleRssResponse` type; add a shared `ApiErrorBody`
  (`{ error: { code, message, details?, status } }`).

## Environment variables

- worker-node `.env.example` add: `NODE_ENV=development`, `NAME_APP=NewsNexusLiteWorker`,
  `PATH_TO_LOGS=./logs`, `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5` (keep `PORT` + scrape vars);
  gitignore `logs/`.
- portal `.env.example`: document `LOG_LEVEL` (optional, default `info`).

## Key files

- worker-node: `src/logger.ts` (rewrite internals), `src/http/errors.ts` (new),
  `src/server.ts` (import order + env validation + flush), job routes + scrape `start-job`
  (envelope), health.
- portal: `src/lib/serverLogger.ts` (confirm), `src/lib/http/errors.ts` (new), Search route,
  `serverProxy.ts` + proxy route handlers (envelope + logging fix), `jobClient.ts`,
  `SearchBar.tsx`, `ScrapeBar.tsx` + their tests, `src/lib/google-rss/types.ts`.

## Testing approach

- worker-node: env-validation fatal-exit tested in an **isolated child process**; tests set
  required env before importing app/routes; representative error responses (unknown-job
  `NOT_FOUND` 404, `start-job` `VALIDATION_ERROR` 400) assert the envelope; no `console.*`
  remains in committed server code.
- portal: Search + proxy error branches assert the envelope + status; `SearchBar`/`ScrapeBar`
  render the server message on failure; proxy logs metadata (no body snippet); success-path
  tests stay green.
- End of phase: type/lint, tests, build in both apps per `PLAN_AND_VET.md`.

## Risks / open questions

- **Live parallel edits**: worker-node + scrape files are being edited in the tree by another
  agent; sequence this cycle to avoid collisions, and rebase onto the committed baseline
  rather than the in-flight shims where they conflict.
- **`rate_limited` / proxy codes**: 503 vs 429, and 503 vs 502 for the proxy — finalize at
  TODO time.
- **Logger export-surface stability**: keeping `logInfo/...` avoids touching call sites; a
  full singleton-instance refactor would widen the diff — decide at TODO time.
- **Scrape Phase 9 bookkeeping**: ensure the scrape retrofit is tracked once (here), and mark
  Phase 9 closed by this cycle to avoid double work.
