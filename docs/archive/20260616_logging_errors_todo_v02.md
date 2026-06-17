---
created_at: 2026-06-16
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Logging & Error Handling — TODO v02

> **Changes from v01** (resolves `docs/20260616_logging_errors_todo_v01_assessment_codex.md`;
> narrow fix only): `portal/src/lib/serverLogger.ts` must emit via `process.stdout.write` /
> `process.stderr.write` (not `console.*`), so the Phase 6 no-`console.*` sweep is **literal
> with no exceptions**. Phase 6 and the finalized decisions are updated accordingly; all
> other phases are unchanged from v01.

Implementation task list for the **cross-cutting logging/errors remediation cycle**. It
implements `docs/20260616_logging_errors_plan_v03.md` and the `AGENTS.md` "Logging" +
"Error Handling" standard (backed by `docs/LOGGING_NODE_JS_V08.md`,
`docs/ERROR_REQUIREMENTS.md`). It is **not** one of the 6 product stages and adds **no**
stage 4–6 feature work.

## How to use this file

- Work top to bottom, one phase at a time. Do not start a phase until the previous phase's
  end-of-phase checks pass.
- End-of-phase checks run in **both apps**: type-check → lint → test → build (portal) and
  type-check → lint → test → build (worker-node).
- **Do not commit until Phase 8** (single remediation commit), mirroring prior cycles.

## Context & ownership

- This cycle **owns all currently existing endpoints** (committed) + the shared infra. It is
  a retrofit of committed code (`HEAD` = `1ecd31c feat: add scrape stage worker`) plus new
  shared plumbing, landing as its **own follow-up commit**.
- **Closes Scrape TODO Phase 9**: the scrape endpoint/logging retrofit is done here, once.
  When this cycle completes, mark scrape Phase 9 satisfied — do not retrofit scrape twice.
- **Parallel-edit coordination**: the working tree has uncommitted edits (the two logger
  shims `worker-node/src/logger.ts` + `portal/src/lib/serverLogger.ts`, and modified
  `server.ts`, `serverProxy.ts`, `jobClient.ts`, `ScrapeBar.tsx`, etc.). Build on the
  committed baseline: **keep `serverLogger.ts` as the portal standard** (with the
  `process.stdout/stderr.write` change below), **replace the worker `logger.ts` shim with the
  Winston implementation**, and reconcile the other in-flight edits rather than discarding or
  duplicating them. Sync with the implementing agent before editing shared worker files.

## Finalized decisions (were open in the plan)

- `rate_limited` (Google 503) → `SERVICE_UNAVAILABLE`, status **503**.
- worker unreachable from portal proxy → `SERVICE_UNAVAILABLE`, status **503** (replaces
  legacy `{ error: "worker_unavailable" }` 502).
- Keep the `logInfo/logWarn/logError/logDebug` **export surface** (swap internals only).
- **portal `serverLogger` writes via `process.stdout.write` / `process.stderr.write`** (not
  `console.*`), so the no-`console.*` rule applies literally to all committed server code,
  including the logger itself.

## OUT OF SCOPE — do NOT implement

- ❌ Any stage 4–6 (Location/State/Semantic) feature logic.
- ❌ Winston/daily-rotate in the portal (Next.js is excluded by the logging doc).
- ❌ Changing **success**-response payloads (only error branches change).
- ❌ Logging full request/response bodies, query payloads, scraped content, or secrets.
- ❌ Durable log shipping/aggregation beyond the doc's daily-rotate files.

---

## Phase 0 — Preconditions & dependencies

- [x] Confirm `HEAD` includes the committed scrape worker and both apps are green
      (type/lint/test/build). Coordinate with any in-flight parallel edits per Context above.
- [x] worker-node: add deps `winston` + `winston-daily-rotate-file` (pin versions; note in
      commit body).
- [x] worker-node `.env.example`: add `NODE_ENV=development`,
      `NAME_APP=NewsNexusLiteWorker`, `PATH_TO_LOGS=/absolute/path/to/logs` (**absolute**
      placeholder), `LOG_MAX_SIZE=5`, `LOG_MAX_FILES=5` (keep `PORT` + scrape vars).
      Gitignore the log directory if it lives under the repo.
- [x] portal `.env.example`: document `LOG_LEVEL` (optional, default `info`).

### End-of-phase checks (Phase 0)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 1 — worker-node compliant Winston logger + startup validation

- [x] Rewrite the internals of `worker-node/src/logger.ts` to Winston +
      `winston-daily-rotate-file`, **keeping the `logInfo/logWarn/logError/logDebug` exports**.
      Mode by `NODE_ENV`: development=console, testing=console+files, production=files. Dated
      `{NAME_APP}-YYYY-MM-DD.log`; `maxSize` from `LOG_MAX_SIZE`, `maxFiles` from
      `LOG_MAX_FILES`. Singleton, initialized before other app code.
- [x] Startup env validation (in the logger module or a sibling, run before logger use):
      - required: `NODE_ENV`, `NAME_APP`, `PATH_TO_LOGS` — missing → fatal (stderr +
        `process.exit(1)`);
      - `NODE_ENV` must be one of `development|testing|production` (vitest's default `test`
        fails);
      - `PATH_TO_LOGS` must be **absolute** — reject relative (do not normalize);
      - apply the doc's flush-before-exit delay on fatal paths.
- [x] `worker-node/src/server.ts`: import order `dotenv` → logger/validation → `createApp()`;
      apply the early-exit flush pattern. Remove the `console.log` listen log in favor of the
      logger.
- [x] Vitest setup: worker tests run with **`NODE_ENV=testing`** (Vitest config/setup file or
      the `test` script) and set `NAME_APP` + an absolute `PATH_TO_LOGS` before importing
      app/routes, so import-time validation does not kill the test process.
- [x] Tests: **isolated child-process** fatal-exit cases — missing required var, invalid
      `NODE_ENV` (`test`), and relative `PATH_TO_LOGS`. Confirm no `console.*` remains in
      committed worker server code (Winston handles transports).

### End-of-phase checks (Phase 1)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 2 — Shared error-envelope helpers

- [x] `worker-node/src/http/errors.ts`: envelope builder + Express error-handling middleware
      that logs the detail via the logger and returns the sanitized
      `{ error: { code, message, details?, status } }`; `details` only when
      `NODE_ENV === "development"`. Wire the middleware in `worker-node/src/app.ts` after the
      routes.
- [x] `portal/src/lib/http/errors.ts`: `errorJson({ code, message, status, details? })` →
      `NextResponse.json({ error: {...} }, { status })`; logs via `serverLogger`; `details`
      only in development. Export a shared `ApiErrorBody` type.
- [x] Tests: helper unit (envelope shape; `details` present in development, omitted otherwise).

### End-of-phase checks (Phase 2)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 3 — Retrofit worker-node endpoints

- [x] `worker-node/src/jobs/routes.ts`: `GET /jobs/:jobId` and `POST /jobs/:jobId/cancel`
      unknown id → `NOT_FOUND` 404 envelope (replace legacy `{ error: "job_not_found" }`);
      unexpected failures flow through the error middleware as `INTERNAL_ERROR` 500.
- [x] `worker-node/src/modules/article-content-02/routes.ts`: scrape `start-job` invalid body
      → `VALIDATION_ERROR` 400 envelope.
- [x] Replace any `console.*` in these routes/modules with the logger; log **metadata**
      (ids, counts, status, failure type) — never bodies/content.
- [x] Update worker tests (`jobs/routes.test.ts`, `modules/article-content-02/routes.test.ts`,
      `app.test.ts`) to assert the envelope + status.

### End-of-phase checks (Phase 3)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 4 — Retrofit portal Search endpoint + consumer

- [x] `portal/src/app/api/google-rss/make-request/route.ts`: replace the `errorResponse()`
      `{ success, errorCode, error }` branches with `errorJson` envelopes — empty query →
      `VALIDATION_ERROR` 400; Google 503 → `SERVICE_UNAVAILABLE` 503; parse/other →
      `INTERNAL_ERROR` 500. **Success payload unchanged** (`{ url, articlesArray, count }`).
      Log failures via `serverLogger` (metadata only).
- [x] `portal/src/lib/google-rss/types.ts`: drop the error fields from the success type; use
      the shared `ApiErrorBody` for error responses.
- [x] `portal/src/components/search/SearchBar.tsx`: failure handling reads non-2xx +
      `data.error.message` (remove/reduce `getFailureMessage`).
- [x] Update `route.test.ts` and `SearchBar.test.tsx` for the envelope + message rendering.

### End-of-phase checks (Phase 4)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 5 — Retrofit portal proxy + scrape consumers

- [x] `portal/src/lib/worker/serverProxy.ts`: **remove the `body.slice(0, 500)` log**; on a
      failed worker response log metadata only (method, path, upstream status, error `code`,
      failure type) via `serverLogger`. Worker unreachable → `SERVICE_UNAVAILABLE` 503
      envelope (replace `{ error: "worker_unavailable" }`).
- [x] Portal worker route handlers (`app/api/worker/article-content-scraper-02/start-job`,
      `app/api/worker/jobs/[jobId]`, `app/api/worker/jobs/[jobId]/cancel`): ensure error paths
      return the envelope (via the proxy/`errorJson`).
- [x] `portal/src/lib/worker/jobClient.ts` + `scrapeClient.ts`: read the `data.error` envelope
      on failure (not the legacy string shape).
- [x] `portal/src/components/scrape/ScrapeBar.tsx`: failure handling reads
      `data.error.message`.
- [x] Update tests: `serverProxy`, `jobClient.test.ts`, the three worker-route `route.test.ts`
      files, and `ScrapeBar.test.tsx`.

### End-of-phase checks (Phase 5)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 6 — Reconcile loggers & console sweep

- [x] Update `portal/src/lib/serverLogger.ts` to write structured lines via
      `process.stdout.write` / `process.stderr.write` (append newline), **not `console.*`**,
      preserving its `logDebug/logInfo/logWarn/logError` API and `LOG_LEVEL` behavior. It
      remains the portal standard, imported only by server-side code (route handlers / server
      actions), never client components.
- [x] Sweep both apps: **no `console.*` anywhere in committed server code, with no
      exceptions** — the worker logs via Winston transports, the portal logs via the
      `process.stdout/stderr.write`-based `serverLogger`. Replace any remaining occurrences.
      Client UI components must not log in committed code.

### End-of-phase checks (Phase 6)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 7 — Verification (manual + automated)

- [x] worker-node: missing required env, invalid `NODE_ENV`, and relative `PATH_TO_LOGS` each
      fatal-exit with a clear stderr message; in testing/production modes a dated
      `{NAME_APP}-YYYY-MM-DD.log` is written under the absolute `PATH_TO_LOGS`.
- [x] Representative error responses across **all** endpoints (Search, worker job routes,
      scrape `start-job`, portal proxy routes) return the standard envelope; `details` only in
      development; no body/secret logging anywhere.
- [x] `SearchBar` and `ScrapeBar` render the server error message on failure.
- [x] A literal `console.` grep over committed server code in both apps returns nothing.
- [x] Mark **Scrape TODO Phase 9 closed** by this cycle.

### End-of-phase checks (Phase 7)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 8 — Commit (only after all checks pass)

- [x] All phases complete; all end-of-phase checks green in both apps; every checkbox above
      checked off.
- [x] Stage and commit per `AGENTS.md` (broad commit — shared logging/error infra + retrofit
      across both apps): lowercase title ≤ 50 chars, body explaining *why* + main areas,
      reference this TODO file and its phases, append
      `co-authored-by: <agent name> (<model>)`.
- [x] Do **not** push. After this cycle, resume **stage 4 (Location)** per
      `docs/20260615_build_sequence.md`.
