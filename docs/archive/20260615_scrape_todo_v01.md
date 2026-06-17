---
created_at: 2026-06-15
updated_at: 2026-06-16
created_by: claude (opus-4.8)
modified_by: codex (gpt-5)
---

# Scrape — TODO v01

Implementation task list for **stage 3 of 6** (Scrape). It implements
`docs/20260615_scrape_plan_v02.md` and only PRD §2 "Scraping Section"
(`docs/NewsNexus12LiteV02_prd.md`). It introduces the **`worker-node` app** and the
**generic portal↔worker job/poll/cancel contract**, then populates the **Scraped** column.

## How to use this file

- Work top to bottom, one phase at a time. Do not start a phase until the previous phase's
  end-of-phase checks pass.
- End-of-phase checks run in **both apps where they exist**: type-check → lint → test →
  build (portal) and type-check → lint → test → build (worker-node).
- If a check fails, fix the code so functionality remains and checks pass before moving on.
- **Do not commit until Phase 8** (one commit per stage, then stop), mirroring the prior
  stages and `docs/20260615_build_sequence.md`.

## Roadmap context (read before writing code)

- This is part **3 of 6**. Full sequence: Foundation → Search → **Scrape** → Location →
  State → Semantic.
- **Build the job/poll/cancel contract as a GENERIC, reusable abstraction.** Stages 4 and
  6 must reuse the same generic status/cancel routes + portal `jobClient`, adding only
  their own workflow-specific `start-job` route and processor. Do **not** create
  per-workflow poll/cancel routes.
- The table renders **all 7 columns** from stage 1; this stage only populates **Scraped**.
  Do not reorder/restructure the table or touch Location/State/Semantic fields.
- All data is **ephemeral / in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build rating/state/semantic behavior.

## Contract verified against committed `portal/src` (2026-06-15)

Search (stage 2) is committed and green; bind to these real names (matches scrape plan
V02, so **no plan V03 required**):

- `portal/src/state/types.ts` — `Article` with reserved `scrape?: ScrapeResult`;
  `ScrapeResult` is currently the **minimal stub** `{ content?, resolvedUrl? }` → this
  stage **extends** it (additive). `FlowState` has only `currentStage` + `articles` → this
  stage **adds** scrape run status.
- `portal/src/state/flowReducer.ts` — currently only `setStage`/`setArticles`/`resetFlow`
  → this stage **adds** scrape run + merge-by-id actions. `resetFlow` recreates initial
  state (so it auto-clears new fields once they default empty).
- `portal/src/components/search/StageActionArea.tsx` — returns `null` unless `"search"` →
  add the `"scrape"` branch.
- `portal/src/components/layout/FlowIndicatorBar.tsx` — `canAdvance` is search-only →
  extend for scrape completion.
- `portal/src/components/tables/cells/ScrapedCell.tsx` — **currently shows a check for any
  non-empty `scrape`** (ignores `status`/length) → must be fixed.
- `portal/src/components/search/SearchBar.tsx` — reference pattern: client component →
  `fetch("/api/...")` → `dispatch`. Mirror it for the Scrape control.
- `portal/src/app/page.tsx` — composes `<SlideStage><TopBar/><FlowIndicatorBar/>
  <StageActionArea/><ArticlesTable/></SlideStage>`; `page.test.tsx` placement/Next locks
  **must still pass**.

## Cross-cutting: Logging & Error Handling (added after initial completion)

This stage's tasks were checked off before the project Logging/Error-Handling standard
existed (`AGENTS.md`; `docs/LOGGING_NODE_JS_V08.md`, `docs/ERROR_REQUIREMENTS.md`). Rather
than re-opening the completed phases, compliance is tracked as an explicit **blocking
remediation gate — see Phase 9 below**, which **must pass before the stage-3 changes are
committed** (even though Phase 8 is already checked). Any further edits here must not add
`console.*` in committed server code or non-standard error response shapes.

## OUT OF SCOPE for this stage — do NOT implement (hard guardrails)

- ❌ No Hugging Face / OpenAI / rating / state / semantic logic (stages 4–6); do not
  populate columns 5–7 or their fields.
- ❌ No `@newsnexus/db-models`, `ArticleContents02`, DB, durable queue, broad DB article
  targeting, or `articleIds` cursor selection.
- ❌ No captcha/consent solving.
- ❌ No per-workflow poll/cancel routes — status/cancel are generic.
- ❌ No durable persistence of any kind: no DB, files, `localStorage`, `sessionStorage`,
  cookies. Scrape outcomes/content/job records live only in worker-node job memory and
  portal in-memory state.
- ❌ Do not reorder/restructure the table or move persistent regions outside `SlideStage`.

---

## Phase 0 — Preconditions & worker-node scaffold

- [x] Verify Search (stage 2) is committed and `portal/` is green (type/lint/test/build).
      Verify the contract names above; if any differ, stop and request a plan V03.
- [x] Choose the worker-node test runner: **vitest + supertest** (repo consistency,
      recommended) or jest + supertest (source parity). Pin versions.
- [x] Scaffold `worker-node/` (sibling to `portal/`): Express + TypeScript app with
      `package.json` scripts `dev` (tsx watch), `build`, `start`, `lint`, `type-check`,
      `test`; `tsconfig.json`; ESLint; `dotenv`. Add deps `express`, `playwright`,
      `cheerio` and the chosen test deps; pin versions and note them in the commit body.
- [x] Add `worker-node/.env.example`: `PORT=8081`,
      `ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS=90000`,
      `ARTICLE_CONTENT_02_BROWSER_RECYCLE_ATTEMPTS=25`,
      `ARTICLE_CONTENT_02_BROWSER_RECYCLE_NAVIGATION_ERRORS=3`. Ensure `.env*`,
      `node_modules/`, build output are gitignored for worker-node.
- [x] Document `npx playwright install chromium` as a setup step (README note or
      package script). Add a trivial health route (`GET /health`) + smoke test.

### End-of-phase checks (Phase 0)
- [x] worker-node: type-check · lint · test · build pass. portal still green.

---

## Phase 1 — Generic in-memory job registry + generic routes (worker-node)

- [x] `src/jobs/registry.ts` — in-memory registry: `createJob(workflow, total)`,
      `getJob(jobId)`, `updateProgress`, `setResults`, `complete`/`fail`, `cancel`. Each
      job holds `jobId`, `workflow`/`endpointName`, `status`
      (`queued|running|completed|failed|cancelled`), `processed`, `total`, `summary`,
      workflow-specific `results`, and an `AbortController`.
- [x] `src/jobs/runner.ts` — generic async runner: given a job, an item list, and a
      per-item processor honoring `AbortSignal`, it iterates sequentially, updates
      progress, collects results, and sets terminal status (respecting cancellation).
- [x] Generic routes: `GET /jobs/:jobId` (shared envelope `{ jobId, workflow, status,
      processed, total, summary, results }`; 404 for unknown id) and
      `POST /jobs/:jobId/cancel` (abort → `cancelled`).
- [x] Tests (supertest): unknown id → 404; a fake workflow job transitions
      queued→running→completed; cancel aborts mid-run.

### End-of-phase checks (Phase 1)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 2 — Scrape config + pure pipeline modules (no live network)

Create under `worker-node/src/modules/article-content-02/`:

- [x] `types.ts` — `ScrapeResult` (full field set) and the `failureType` /
      `extractionSource` / `bodySource` union vocabularies from the plan.
- [x] `config.ts` — env parse/validate: `ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS` (default
      `90000`, floor `10000`), recycle attempts (`25`) and nav-errors (`3`); expose fixed
      constants (Google nav `30000`/post-load `5000`/retries `2`; publisher nav
      `20000`/post-load `2500`/retries `2`; thresholds: content `200`, paragraph `20`,
      incomplete-HTML `500`).
- [x] `googleClassifier.ts` — classify a Google page (final URL + HTML) as blocked
      (consent/captcha/anti-bot/news-shell patterns) vs ok.
- [x] `publisherClassifier.ts` — classify a publisher response as blocked vs incomplete
      (`<500` chars / JS-cookie wall) vs usable.
- [x] `publisherExtractor.ts` — discover publisher URL in order canonical → `og:url` →
      JSON-LD → first non-Google link; reject Google-owned candidates; set
      `extractionSource`.
- [x] `articleParser.ts` — Cheerio parse: remove `script/style/noscript/nav/header/
      footer/svg`; title `og:title`→`h1`→`<title>`; body from `<p>` (≥20 chars) joined +
      normalized, else normalized body text; `<200` chars → `short_content`.
- [x] Unit tests with fixture HTML strings for each module (no Playwright/network):
      classifier patterns, extraction order + Google rejection, parser element removal /
      title order / short_content, config validation (timeout floor, defaults).

### End-of-phase checks (Phase 2)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 3 — Scrape orchestration (Playwright/fetch) + start-job route

- [x] `navigationSessionManager.ts` — own one Chromium/context; reuse across articles;
      recycle per the configured attempt/nav-error thresholds.
- [x] `googleNavigator.ts` — Playwright nav to the Google RSS URL (desktop UA, `en-US`,
      `1440x900`, browser-like `Accept*`; `domcontentloaded` + post-load wait; retries).
      Returns final URL + HTML or a `navigation_error`.
- [x] `publisherFetcher.ts` — direct `fetch` first (browser headers, follow redirects);
      on blocked/incomplete → Playwright fallback (same context); retries; all throw →
      `publisher_fetch_error`; keep the better result.
- [x] `enrichment.ts` — per-article pipeline: RSS shortcut (`content` ≥ 200 →
      `bodySource: "rss-feed"`), no-URL skip, Google nav+classify, publisher discovery,
      publisher fetch, parse → produce a full `ScrapeResult` (success or fail) with
      `status`, vocab fields, status codes.
- [x] `POST /article-content-scraper-02/start-job` — validate `{ articles }`, create a job
      via the registry, start the runner with the scrape processor (per-article timeout +
      `AbortSignal`), return `{ jobId, status: "queued", endpointName:
      "article-content-scraper-02" }`. Results keyed by article `id`.
- [x] Tests (mock Playwright + `fetch`): enrichment branches — rss shortcut, no url,
      blocked_google, no_publisher_url_found, blocked_publisher, short_content, success;
      summary counts (considered/skipped/success/failed); mid-run cancel.

### End-of-phase checks (Phase 3)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 4 — Portal worker client + generic proxy routes

- [x] Add `WORKER_NODE_URL` (e.g. `http://localhost:8081`) to `portal/.env.example`. The
      portal calls the worker **server-side only**.
- [x] Generic proxy route handlers (worker URL stays server-side):
      - `src/app/api/worker/jobs/[jobId]/route.ts` — `GET` → proxy worker `GET /jobs/:id`.
      - `src/app/api/worker/jobs/[jobId]/cancel/route.ts` — `POST` → proxy cancel.
      - `src/app/api/worker/article-content-scraper-02/start-job/route.ts` — `POST` → proxy
        the scrape start-job (workflow-specific).
- [x] `src/lib/worker/jobClient.ts` — generic client used from the browser:
      `startJob(endpoint, payload)`, `pollJob(jobId)` (poll until terminal with interval +
      safety cap), `cancelJob(jobId)`; all hit the portal `/api/worker/...` routes.
- [x] `src/lib/worker/scrapeClient.ts` — `startScrapeJob(articles)` =
      `startJob("article-content-scraper-02", { articles })`.
- [x] Tests (mock fetch): proxy routes forward correctly; `jobClient.pollJob` resolves on
      `completed`/`failed`/`cancelled` and stops polling; no `WORKER_NODE_URL` leaks to the
      client bundle.

### End-of-phase checks (Phase 4)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 5 — Portal state additions

- [x] Extend `portal/src/state/types.ts`: widen `ScrapeResult` to the full field set
      (additive — keep existing optional fields); add `ScrapeRunStatus`
      (`status: "idle"|"running"|"completed"|"failed"|"cancelled"`, `processed`, `total`,
      `summary: { considered, skipped, success, failed }`); add optional `scrapeRun` to
      `FlowState`.
- [x] Extend `portal/src/state/flowReducer.ts`: add `setScrapeRun(status)` and
      `applyScrapeResults(results)` (merge each `ScrapeResult` onto `article.scrape` by
      `id`; success and failure alike). Confirm `resetFlow` clears `scrapeRun` and scrape
      data (recreates initial state).
- [x] Tests: `applyScrapeResults` merges by id without disturbing other fields; a
      `status: "fail"` result is stored on `article.scrape`; `resetFlow` clears scrape run
      + results.

### End-of-phase checks (Phase 5)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 6 — Portal UI: Scrape control, ScrapedCell fix, modal, wiring

- [x] `src/components/scrape/ScrapeBar.tsx` (`"use client"`, mirror `SearchBar`): a
      **Scrape** button → `startScrapeJob(state.articles)` → `pollJob` → on each
      update/terminal `dispatch(setScrapeRun(...))` and `dispatch(applyScrapeResults(...))`.
      Show progress (`processed/total`) + summary counts. Disable the button while running.
- [x] Extend `StageActionArea` with the `"scrape"` branch → `<ScrapeBar/>`.
- [x] Extend `FlowIndicatorBar`: `canAdvance` also true when
      `currentStage === "scrape" && scrapeRun?.status === "completed"` (enabled after
      completion **even with failures**; disabled while running).
- [x] **Fix `src/components/tables/cells/ScrapedCell.tsx`**: render the check-mark only
      when `scrape?.status === "success"` **and** `(scrape.content?.length ?? 0) >= 200`;
      otherwise render empty. Wire the check to open the modal.
- [x] `src/components/tables/cells/ScrapeModal.tsx` (or in-cell modal): show scraped
      `title`, `publisherUrl`, `bodySource`, `extractionSource`, and `content`. Ephemeral.
- [x] Update `columns.tsx` only if needed to pass an `onOpen`/modal handler to
      `ScrapedCell` (do not reorder columns).
- [x] Tests: `ScrapedCell` gating (success+≥200 → check; fail/short/absent → empty);
      `ScrapeBar` run flow (mocked client) updates table + run status; `FlowIndicatorBar`
      scrape gating; `page.test.tsx` still passes.

### End-of-phase checks (Phase 6)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 7 — Stage verification (manual + automated)

- [x] Both apps install/build from a clean checkout; `npx playwright install chromium`
      documented; worker-node `dev` serves routes; portal `dev` runs.
- [x] Run Search → advance to Scrape → click Scrape: the **Scraped** column shows a
      check-mark only for successful, ≥200-char results; the modal shows title/publisher
      URL/body source/extraction source/content; failed/short rows stay blank.
- [x] Next is **disabled while running** and **enabled after completion even if some
      articles failed**; summary counts (considered/skipped/success/failed) display.
- [x] `resetFlow` clears scrape outcomes, content, and run status.
- [x] Confirm **no persistence** and **no out-of-scope** work: no db-models,
      no `ArticleContents02`, no durable queue, no per-workflow poll/cancel routes,
      columns 5–7 untouched, table not restructured.
- [x] Note: real Google/publisher blocking is expected — confirm `blocked_*` outcomes
      degrade gracefully and do not block advancing.

### End-of-phase checks (Phase 7)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 8 — Commit (only after all checks pass)

- [x] All phases complete; all end-of-phase checks green in both apps; every checkbox
      above checked off; no files outside this stage's scope modified beyond the documented
      portal additions (`state`, `components`, `api/worker`, `lib/worker`, `.env.example`)
      and the new `worker-node/` app.
- [x] Stage and commit per `AGENTS.md` (broad commit — new worker-node app + portal
      integration): lowercase title ≤ 50 chars, body explaining *why* + main areas,
      reference this TODO file and its phases, append
      `co-authored-by: <agent name> (<model>)`.
- [x] Do **not** push. Do **not** start stage 4 (Location) — stop after the stage 3 commit
      per `docs/20260615_build_sequence.md`.

---

## Phase 9 — Logging & Error Handling remediation (BLOCKS the stage-3 commit)

> Added after initial completion to enforce the `AGENTS.md` Logging & Error Handling
> standard. **The stage-3 changes must not be committed until every box here is checked**,
> regardless of Phase 8 being marked complete. This work may be executed as the
> scrape-specific slice of the dedicated logging/errors cycle, but its gate lives here.

- [x] **worker-node logger**: initialize a singleton Winston logger per
      `docs/LOGGING_NODE_JS_V08.md` (created before any other app code; required-env
      validation for `NODE_ENV`/`NAME_APP`/`PATH_TO_LOGS` with fatal exit on missing;
      daily-rotate `{NAME_APP}-YYYY-MM-DD.log` naming). Reconcile the existing
      `worker-node/src/logger.ts` into it.
- [x] **No `console.*`** in committed worker-node server code (registry, runner, scrape
      modules, routes, server bootstrap) — use the logger. Never log secrets or full
      article bodies (log ids, counts, statuses, failure types).
- [x] **portal logging**: scrape proxy route handlers (`api/worker/...`) and any server
      code log via `portal/src/lib/serverLogger.ts`; no `console.*` in committed server
      code.
- [x] **shared error helper** in each app producing the standard envelope
      `{ error: { code, message, details?, status } }`; `details` only when
      `NODE_ENV === "development"`.
- [x] **error envelopes on every endpoint** added by this stage: worker
      `POST /article-content-scraper-02/start-job`, generic `GET /jobs/:jobId` (e.g.
      `NOT_FOUND` 404 for unknown id) and `POST /jobs/:jobId/cancel`, and the portal proxy
      routes. Map validation → `VALIDATION_ERROR` 400; unexpected → `INTERNAL_ERROR` 500.
      Log detail server-side, return sanitized envelope.
- [x] **tests**: at least one representative worker error response (e.g. unknown-job 404
      envelope, validation 400) and one portal proxy error response assert the standard
      envelope shape.

### End-of-phase checks (Phase 9)
- [x] worker-node + portal: type-check · lint · test · build pass.
- [x] Only after all boxes above are checked may the stage-3 changes be committed (Phase 8).
