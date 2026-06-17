---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Logging & Error Handling — Plan V01

## What this is (and is not)

A **cross-cutting remediation cycle**, not one of the 6 product stages. It (1) stands up the
shared logging + error-handling infrastructure each app needs, and (2) retrofits the code
that already exists to the project standard. It does **not** add any stage 4–6 feature work.

- **Standard** (what compliance means): `AGENTS.md` "Logging" + "Error Handling" sections,
  backed by `docs/LOGGING_NODE_JS_V08.md` and `docs/ERROR_REQUIREMENTS.md` (authoritative).
- **Future stages** comply by reusing the infra this cycle builds + the `AGENTS.md` refs
  already added to the open TODOs — they do not need their own logging plan.

## Goal

After this cycle: worker-node logs via a compliant Winston logger; the portal logs via
`serverLogger`; both apps have a shared error-envelope helper; and every existing endpoint
(Search now, Scrape via its Phase 9) returns the standard `{ error: { code, message,
details?, status } }` envelope with detail logged server-side.

## Current state (verified 2026-06-16)

- `worker-node/src/logger.ts` and `portal/src/lib/serverLogger.ts` are **identical
  console-based shims** (`logDebug/info/warn/error`, `LOG_LEVEL`). The portal one is an
  acceptable Next.js logger; the worker one is **not** compliant (standard Node apps must
  use Winston + daily-rotate per `LOGGING_NODE_JS_V08.md`).
- `portal/src/app/api/google-rss/make-request/route.ts` returns errors as
  `{ success: false, errorCode, error }` (an `errorResponse()` helper) — **not** the
  standard envelope. Its success payload `{ url, articlesArray, count }` is fine as-is.
- Consumers read the old shape: `SearchBar.tsx` (`data.success` / `data.errorCode` via
  `getFailureMessage`) and the Search route test; the scrape consumers
  (`jobClient.ts` / `ScrapeBar.tsx`) similarly.
- worker-node is a **single process** (no child processes), so the
  `NAME_CHILD_PROCESS_*` part of the logging doc does not apply.

## Scope

**In scope**

1. Shared infrastructure (net-new plumbing):
   - worker-node compliant Winston logger; portal `serverLogger` confirmed as the Next.js
     logger; an error-envelope helper in each app.
2. Retrofit existing code to the standard:
   - Search route + its consumers (`SearchBar`) + tests.
   - Scrape endpoints/consumers (worker routes, portal proxy, `jobClient`, `ScrapeBar`) —
     see the ownership note under Risks (executed under Scrape's Phase 9, using this infra).
   - Reconcile the two ad-hoc loggers into the standard.

**Out of scope**

- Any stage 4–6 (Location/State/Semantic) feature logic.
- Winston/daily-rotate in the portal (the logging doc excludes Next.js).
- Changing success-response payloads (only **error** branches change).
- Durable log shipping/aggregation beyond the daily-rotate files the doc specifies.

## Approach

### worker-node logging (compliant)

- Replace the internals of `worker-node/src/logger.ts` with Winston +
  `winston-daily-rotate-file`, **keeping the existing `logInfo/logWarn/logError/logDebug`
  export surface** so current call sites (e.g. `server.ts`) keep working.
- Singleton logger initialized before other app code; mode by `NODE_ENV`
  (development=console, testing=console+files, production=files); dated
  `{NAME_APP}-YYYY-MM-DD.log` naming; `LOG_MAX_SIZE`/`LOG_MAX_FILES`.
- **Startup env validation**: fatal-exit (stderr + `process.exit(1)`) if `NODE_ENV`,
  `NAME_APP`, or `PATH_TO_LOGS` is missing, before logger init. Apply the doc's
  "ensure logs on early exit" pattern (flush delay before exit) in `server.ts` bootstrap.
- Install `winston`, `winston-daily-rotate-file`.

### portal logging (Next.js)

- Keep `serverLogger.ts` as the portal standard (structured lines to stdout/stderr). Confirm
  it is only imported by server-side code (route handlers / server actions), never client
  components. No Winston.

### Shared error-envelope helper (both apps)

- worker-node: `src/http/errors.ts` — `sendError(res, { code, message, status, details? })`
  building the envelope, plus an Express error-handling middleware that logs the detail via
  the logger and returns the sanitized envelope; `details` only when
  `NODE_ENV === "development"`.
- portal: `src/lib/http/errors.ts` — `errorJson({ code, message, status, details? })`
  returning `NextResponse.json({ error: {...} }, { status })`; same dev-only `details` rule;
  logs via `serverLogger`.

### Error-code mapping (apply consistently)

| Case | code | status |
|---|---|---|
| blank query / invalid body | `VALIDATION_ERROR` | 400 |
| Google News 503 (rate/unavailable) | `SERVICE_UNAVAILABLE` | 503 |
| RSS parse / unexpected server failure | `INTERNAL_ERROR` | 500 |
| unknown job id (`GET /jobs/:id`, cancel) | `NOT_FOUND` | 404 |

(`SERVICE_UNAVAILABLE`/503 chosen for the Google case to match the actual upstream status
and existing behavior; `RATE_LIMIT_EXCEEDED`/429 is the alternative — decide at TODO time.)

### Consumer ripple (don't miss this)

Changing the **error** shape breaks clients that read `data.success`/`data.errorCode`:

- `SearchBar.tsx`: switch failure handling to "non-2xx → show `data.error.message`"
  (the envelope already carries a user-facing message; `getFailureMessage` can be dropped or
  reduced to a fallback). Update `route.test.ts` and `SearchBar.test.tsx`.
- Split the `GoogleRssResponse` type: keep the success payload; add a shared `ApiErrorBody`
  (`{ error: { code, message, details?, status } }`) used by both apps.
- Scrape consumers (`jobClient.ts`, `ScrapeBar.tsx`) read the same envelope on error.

## Environment variables

- worker-node `.env.example` add: `NODE_ENV=development`, `NAME_APP=NewsNexusLiteWorker`,
  `PATH_TO_LOGS=./logs`, `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5` (keep existing `PORT` and scrape
  vars). Ensure `logs/` is gitignored.
- portal `.env.example`: document `LOG_LEVEL` (optional, default `info`).

## Key files

- worker-node: `src/logger.ts` (rewrite internals), `src/http/errors.ts` (new),
  `src/server.ts` (env validation + early-exit flush), scrape/job routes (envelope).
- portal: `src/lib/serverLogger.ts` (confirm), `src/lib/http/errors.ts` (new),
  `src/app/api/google-rss/make-request/route.ts` (envelope), `SearchBar.tsx` + tests,
  scrape proxy/`jobClient`/`ScrapeBar` (envelope), `src/lib/google-rss/types.ts` (types).

## Testing approach

- worker-node: logger env-validation fatal-exit on missing var; representative error
  responses (unknown-job `NOT_FOUND` 404, `start-job` `VALIDATION_ERROR` 400) assert the
  envelope; no `console.*` remains in committed server code.
- portal: Search route error branches assert the envelope + status; `SearchBar` renders the
  server message on failure; proxy error response asserts the envelope; existing green tests
  stay green (success paths unchanged).
- End of phase: type/lint, tests, build in both apps per `PLAN_AND_VET.md`.

## Risks / open questions

- **Ownership / commit boundary with Scrape**: Scrape is implemented-but-uncommitted with a
  blocking Phase 9. To avoid double-committing: **this cycle owns + commits** the shared
  infra and the **Search** retrofit; **Scrape's Phase 9 owns** Scrape adopting the infra and
  ships it in the stage-3 commit. The TODO must state this split explicitly. (worker-node
  files are in flux from the parallel scrape work — coordinate before editing.)
- **`rate_limited` code**: `SERVICE_UNAVAILABLE` 503 vs `RATE_LIMIT_EXCEEDED` 429 — finalize
  in the TODO.
- **Keeping the logger export surface stable** avoids touching every worker call site; if a
  full singleton-instance refactor is preferred instead, that widens the diff — decide at
  TODO time.
- **Live parallel edits**: an implementing agent is actively in this tree; sequence this
  cycle so it doesn't collide with in-flight scrape changes.
