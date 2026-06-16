---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Scrape — Plan V02

> **Changes from V01** (resolves `docs/20260615_scrape_plan_v01_assessment_codex.md`):
> 1. **Reusable job API** (concern 1): `start-job` stays endpoint-specific, but **status
>    and cancel are generic** (`GET /jobs/:jobId`, `POST /jobs/:jobId/cancel`). The portal
>    client is generic start/poll/cancel plumbing with scrape as the first consumer, so
>    stages 4 and 6 reuse it without adding per-endpoint poll/cancel routes.
> 2. **`ScrapedCell` correctness** (concern 2): V01 wrongly claimed the Foundation
>    `ScrapedCell` already renders empty for failures. It does not — it shows a check for
>    any non-empty `scrape`. V02 requires updating `ScrapedCell` to gate on
>    `status === "success"` **and** content ≥ 200, and defines exactly where failed results
>    are stored.

## Roadmap context

- This is **part 3 of 6**. Full sequence: Foundation → Search → **Scrape** → Location → State → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§2 "Scraping Section"** of `docs/NewsNexus12LiteV02_prd.md`.
- **This stage introduces the `worker-node` app and the GENERIC portal↔worker job/poll/cancel contract.** Stages 4 (Location) and 6 (Semantic) reuse it by adding only their own `start-job` route + processor — never their own poll/cancel routes.
- The table renders **all 7 columns** from stage 1; this stage only populates the **Scraped** column (check-mark + modal). Do not reorder/restructure the table or touch Location/State/Semantic fields.
- All data is **ephemeral/in-memory**. Never persist scrape outcomes, content, publisher URLs, diagnostics, or job records (no DB, files, localStorage, sessionStorage, cookies).
- Stay within this stage's scope; do not pre-build rating/state/semantic behavior.

## Goal

From the in-memory working article set (Title/Source/Description/link/content from Search), resolve each Google News URL to its publisher page, fetch and parse the article body, and populate the **Scraped** column with a clickable check-mark (success only) opening a modal of the scraped content. Run as an async job in worker-node, driven from the portal via start-job + generic polling.

## Dependency gate

- Binds to the **Search** working-set contract (articles carry `id`, `link`, optional RSS `content`). Search is planned but not yet implemented.
- Per `docs/20260615_build_sequence.md`, do **not** create the Scrape TODO or implement until **Search (stage 2) is committed and green**. Re-verify the real `Article`/state names then; if they differ, revise to a plan V03.

## New architecture: worker-node + GENERIC job/poll/cancel contract

NewsNexus12 exposes scraping from worker-node at `POST /article-content-scraper-02/start-job`, with status/cancellation served by **generic queue-info routes**. Lite reproduces that split: workflow-specific start routes, shared status/cancel.

```
portal                                   worker-node (Express)
  └─ generic job client ──start────▶  POST /article-content-scraper-02/start-job   (workflow-specific)
  └─ poll loop          ──status───▶  GET  /jobs/:jobId                            (GENERIC)
  └─ cancel/reset       ──cancel───▶  POST /jobs/:jobId/cancel                     (GENERIC)
```

- **worker-node app** (`worker-node/`, sibling to `portal/`): Express + TypeScript.
- **Generic in-memory job registry** (worker-node): every job stores `jobId`, `workflow`/`endpointName`, `status` (`queued`|`running`|`completed`|`failed`|`cancelled`), progress (`processed`/`total`), `summary`, a workflow-specific `results` payload, and an `AbortController`. The generic `GET /jobs/:jobId` and `POST /jobs/:jobId/cancel` operate on **any** workflow's job by id. No durable queue, no restart recovery (single-user demo).
- **Generic portal job client** (`portal/src/lib/worker/jobClient.ts`): `startJob(endpoint, payload)`, `pollJob(jobId)`, `cancelJob(jobId)`. Scrape consumes it via a thin `scrapeClient` (`startScrapeJob(articles) → startJob("article-content-scraper-02", { articles })`). Stages 4/6 add their own thin client over the same plumbing.
- Portal→worker calls go through a portal server route/action (worker URL stays server-side).
- **Job lifecycle is a UI model only** — idle → starting → running → completed/failed/cancelled, all ephemeral.

## Source flow to imitate (NewsNexus12, read-only for parity)

- `worker-node/src/routes/articleContentScraper02.ts`
- `worker-node/src/modules/jobs/articleContentScraper02Job.ts`
- `worker-node/src/modules/article-content-02/{config,enrichment,googleNavigator,googleClassifier,publisherExtractor,publisherFetcher,publisherClassifier,articleParser,navigationSessionManager,types}.ts`
- The shared queue/queue-info routes that expose generic job status & cancellation (model the generic `GET /jobs/:jobId` + cancel on these).
- (Skip `persistence.ts`/`repository.ts` — Lite stores nothing durable.)

## Technology & packages (worker-node)

- `express` — worker HTTP routes.
- `playwright` — headless Chromium for Google navigation and publisher-page fallback. Requires `npx playwright install chromium` in setup.
- `cheerio` — parse publisher HTML, extract title/body.
- native `fetch` — direct publisher HTTP before browser fallback.
- `dotenv` — runtime config. `winston` optional (plain logging acceptable; no durable scrape storage).
- **Do not** add `@newsnexus/db-models` or any DB/persistence dependency.
- Test runner: `vitest` (repo consistency) or `jest` (source parity) + `supertest` for HTTP; pin versions.

## Environment variables

worker-node (defaults from source):

| Var | Default | Use |
|-----|---------|-----|
| `ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS` | `90000` (min `10000`) | per-article timeout |
| `ARTICLE_CONTENT_02_BROWSER_RECYCLE_ATTEMPTS` | `25` | recycle Chromium after N attempts |
| `ARTICLE_CONTENT_02_BROWSER_RECYCLE_NAVIGATION_ERRORS` | `3` | recycle after N nav errors |
| `PORT` | (choose, e.g. `8081`) | worker HTTP port |

Fixed constants (match source): Google nav timeout `30000`, Google post-load wait `5000`, Google nav retries `2`; publisher nav timeout `20000`, publisher post-load wait `2500`, publisher fetch retries `2`. RSS-content shortcut and parsed-content thresholds: `200` chars; min paragraph length `20` chars; publisher "incomplete HTML" threshold `500` chars.

portal:

| Var | Default | Use |
|-----|---------|-----|
| `WORKER_NODE_URL` | e.g. `http://localhost:8081` | base URL the portal calls server-side |

## Job/poll/cancel contract (shapes)

- `POST /article-content-scraper-02/start-job` (workflow-specific) — body `{ articles: Article[] }` (each with `id`, `link`/`url`, optional `content`). Returns `{ jobId, status: "queued", endpointName: "article-content-scraper-02" }`.
- `GET /jobs/:jobId` (**generic**) — returns a shared envelope `{ jobId, workflow, status, processed, total, summary, results }`, where for scrape `summary = { considered, skipped, success, failed }` and `results: ScrapeResult[]`. Other workflows fill the same envelope with their own `summary`/`results` payload.
- `POST /jobs/:jobId/cancel` (**generic**) — aborts the run; status → `cancelled`.
- Results are keyed by article `id` so the portal merges them back by id.

## Scrape pipeline (per article, sequential — imitates `enrichment.ts`)

1. **RSS shortcut**: if RSS `content` exists and ≥ `200` chars after cleanup → mark success with `bodySource: "rss-feed"`, skip publisher visit.
2. **No URL** → mark skipped/failed with a clear message; continue.
3. **Google navigation + classification** (`googleNavigator`/`googleClassifier`): open the Google RSS URL in Playwright (desktop UA, `en-US`, `1440x900`, browser-like `Accept*` headers; `domcontentloaded` + post-load wait). Detect blocked/consent/captcha/anti-bot pages and generic Google News shells → `failureType: "blocked_google"`; never solve captchas/consent. Prefer final non-Google URL; else discover publisher URL via canonical → `og:url` → JSON-LD → first non-Google link; reject Google-owned candidates; none found → `no_publisher_url_found`.
4. **Publisher fetch** (`publisherFetcher`/`publisherClassifier`): direct HTTP first (browser-style headers, follow redirects). Classify blocked/anti-bot → `blocked_publisher`. HTML < `500` chars or JS/cookie-wall → incomplete → Playwright fallback (same context). Direct-HTTP throw → retry; all attempts throw → `publisher_fetch_error`. Keep the better result if fallback doesn't improve.
5. **Parse** (`articleParser`): Cheerio; remove `script/style/noscript/nav/header/footer/svg`; title via `og:title` → first `h1` → `<title>`; body from `<p>` (≥ `20` chars), joined + whitespace-normalized, else normalized body text; parsed < `200` chars → `short_content`.
6. **Browser session reuse** (`navigationSessionManager`): reuse one Chromium across articles; recycle per the env thresholds.

## Scrape result shape & vocab (in-memory only)

`ScrapeResult` (per the PRD field list): `articleId`, `googleRssUrl`, `googleFinalUrl`, `publisherUrl`, `publisherFinalUrl`, `title`, `content`, `status` (`success`|`fail`), `failureType`, `details`, `extractionSource`, `bodySource`, `googleStatusCode`, `publisherStatusCode`.

- `failureType` ∈ `blocked_google | blocked_publisher | no_publisher_url_found | navigation_error | publisher_fetch_error | short_content`.
- `extractionSource` ∈ `final-url | canonical | og:url | json-ld | fallback-link | none`.
- `bodySource` ∈ `rss-feed | direct-http | playwright-publisher | google-page | none`.

Foundation declared a minimal reserved `ScrapeResult` in `state/types.ts` (`{ content?, resolvedUrl? }`); this stage **extends that interface** to the full shape above (additive; do not break the existing optional fields).

## State & result storage (resolves concern 2)

- A `ScrapeResult` is produced for **every processed article** (success and failure) and stored on **`article.scrape`** by id — so each row carries its own outcome and the success modal can read it directly.
- Failure diagnostics therefore live on `article.scrape` with `status: "fail"` (plus `failureType`/`details`); they are **not** surfaced in the table cell (see below) and are additionally available in run-status state for debugging.
- Add the run-status concept Foundation reserved: extend flow state/reducer with scrape run status (status, processed/total, summary) and a result-merge-by-`id` action (e.g. `applyScrapeResults` or a `setArticles` replace). Keep the merge action reusable for later stages' result merges.

## Table display (resolves concern 2)

- **Update `portal/src/components/tables/cells/ScrapedCell.tsx`**: render the check-mark **only** when `scrape?.status === "success"` **and** `(scrape.content?.length ?? 0) >= 200`. For absent results, failures, or short content → render empty. (Today it shows a check for any non-empty `scrape`; that must change so merged failure results do not show false success.)
- The check-mark opens a **modal**: scraped title, publisher URL, body source, extraction source, and content. Modal details are ephemeral and only reachable from the success state.
- Failed/short rows leave the cell blank; their details stay in `article.scrape`/run state only.
- Add/extend tests so a merged `status: "fail"` (or short-content) result renders **no** check-mark.

## Portal integration

- **Scrape action**: extend `StageActionArea` (stage-2 reusable slot) with the `"scrape"` branch — replace the search bar with a **Scrape** button.
- **Run**: click Scrape → `startScrapeJob(articles)` → `pollJob(jobId)` until terminal → merge results by id → update run-status UI (progress + summary counts). Keep Next **disabled while running**, enabled after completion **even if some articles failed**.

## Ephemerality rules

- Process only the articles the portal sends; do **not** read NewsNexus12 `Articles` or init db-models.
- Do **not** write `ArticleContents02` or any durable scrape store; no durable queue.
- Store outcomes/content/URLs/diagnostics/job records only in worker-node job memory and portal in-memory state.
- New flow / refresh / `resetFlow` clears all scrape outcomes and content.

## Out of scope

- Hugging Face / OpenAI / rating / state / semantic logic (stages 4–6).
- DB models, `ArticleContents02`, durable queue, broad DB article targeting, `articleIds` cursor selection.
- Captcha/consent solving. Multi-user concurrency (single job at a time per demo session).

## Testing approach

- **Unit (worker-node)** with fixtures: `googleClassifier` (blocked/consent/captcha/shell vs ok), publisher URL discovery order (canonical/og:url/json-ld/fallback, Google-owned rejection), `publisherClassifier` (blocked/incomplete), `articleParser` (element removal, title order, ≥20-char paragraphs, short_content), config validation (timeout min `10000`, recycle defaults), RSS-shortcut threshold. Mock Playwright/fetch — no live network in tests.
- **Generic job registry / routes**: `start-job` returns `jobId`; `GET /jobs/:jobId` reports transitions for a workflow job; `POST /jobs/:jobId/cancel` aborts; summary counts; results keyed by id. `supertest` for routes.
- **Portal**: generic `jobClient` (start/poll/cancel, mocked) + scrape consumer; result-merge-by-id; **`ScrapedCell` gating** (success+≥200 → check; fail/short/absent → empty); run-status UI; Next gating (disabled while running, enabled after completion incl. partial failure). `page.test.tsx` placement locks still pass.
- End of phase: type/lint, tests, build per `PLAN_AND_VET.md`.

## Risks / open questions

- **Playwright in the demo environment**: Chromium install + headless runtime are heavy; Google/publisher blocking is common, so real demos will produce `blocked_*` outcomes. The UI must degrade gracefully (failures don't block advancing). Confirm the demo host can run Playwright.
- **State contract additions**: this stage adds run-status state and a result-merge action to the Foundation reducer, and extends `ScrapeResult` + `ScrapedCell`; confirm naming against the committed Search state before TODO creation.
- **worker-node test runner**: choose vitest (repo consistency) vs jest (source parity) at TODO time.
- **Single-user assumption**: one job at a time; the registry need not isolate concurrent sessions, but the generic `GET /jobs/:jobId` must still address jobs by id for the reuse goal.
- **Per-article content size** travels portal→worker→portal in memory; acceptable for the bounded (≤ limit) demo set.
