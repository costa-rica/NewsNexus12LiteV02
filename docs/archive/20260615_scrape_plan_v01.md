---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Scrape — Plan V01

## Roadmap context

- This is **part 3 of 6**. Full sequence: Foundation → Search → **Scrape** → Location → State → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§2 "Scraping Section"** of `docs/NewsNexus12LiteV02_prd.md`.
- **This stage introduces the `worker-node` app and the portal↔worker-node job/poll contract.** Build that contract as a **reusable abstraction** — stages 4 (Location) and 6 (Semantic) consume the same start-job / poll / cancel pattern. Do not fork it per stage later.
- The table renders **all 7 columns** from stage 1; this stage only populates the **Scraped** column (check-mark + modal). Do not reorder/restructure the table or touch Location/State/Semantic fields.
- All data is **ephemeral/in-memory**. Never persist scrape outcomes, content, publisher URLs, diagnostics, or job records (no DB, files, localStorage, sessionStorage, cookies).
- Stay within this stage's scope; do not pre-build rating/state/semantic behavior.

## Goal

From the in-memory working article set (Title/Source/Description/link/content from Search), resolve each Google News URL to its publisher page, fetch and parse the article body, and populate the **Scraped** column with a clickable check-mark (success) opening a modal of the scraped content. Run as an async job in worker-node, driven from the portal via start-job + polling.

## Dependency gate

- Binds to the **Search** working-set contract (articles carry `id`, `link`, optional RSS `content`). Search is planned but not yet implemented.
- Per `docs/20260615_build_sequence.md`, do **not** create the Scrape TODO or implement until **Search (stage 2) is committed and green**. Re-verify the real `Article`/state names then; if they differ, revise to a plan V02.

## New architecture: worker-node + job/poll contract

NewsNexus12 exposes scraping from worker-node at `POST /article-content-scraper-02/start-job`. Lite reproduces the **interface and lifecycle**, but processes the articles the portal sends (not DB-selected) and persists nothing.

```
portal (Search..Scrape UI)                worker-node (Express)
  └─ scrape client lib  ──start-job──▶  POST /article-content-scraper-02/start-job
                                          (enqueue in-memory job, return jobId)
  └─ poll loop          ──status────▶  GET  /article-content-scraper-02/job/:jobId
  └─ cancel/reset       ──cancel────▶  POST /article-content-scraper-02/job/:jobId/cancel
```

- **worker-node app** (`worker-node/`, sibling to `portal/`): Express + TypeScript. Future-monorepo layout already anticipated by Foundation.
- **In-memory job registry** (worker-node): `jobId`, `status` (`queued`|`running`|`completed`|`failed`|`cancelled`), progress (`processed`/`total`), per-article results, summary counts, and an `AbortController` for cancellation. No durable queue, no restart recovery (single-user demo).
- **Portal scrape client** (`portal/src/lib/worker/`): `startScrapeJob(articles)`, `pollScrapeJob(jobId)`, `cancelScrapeJob(jobId)`. Base URL from env. This is the **reusable** job/poll client stages 4 and 6 generalize.
- **Job lifecycle is a UI model only** — idle → starting → running → completed/failed/cancelled, all ephemeral.

## Source flow to imitate (NewsNexus12, read-only for parity)

- `worker-node/src/routes/articleContentScraper02.ts`
- `worker-node/src/modules/jobs/articleContentScraper02Job.ts`
- `worker-node/src/modules/article-content-02/{config,enrichment,googleNavigator,googleClassifier,publisherExtractor,publisherFetcher,publisherClassifier,articleParser,navigationSessionManager,types}.ts`
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

## Job/poll contract (shapes)

- `POST /article-content-scraper-02/start-job` — body `{ articles: Article[] }` (each with `id`, `link`/`url`, optional `content`). Returns `{ jobId, status: "queued", endpointName: "article-content-scraper-02" }`.
- `GET /article-content-scraper-02/job/:jobId` — returns `{ jobId, status, processed, total, results: ScrapeResult[], summary }` where `summary = { considered, skipped, success, failed }`.
- `POST /article-content-scraper-02/job/:jobId/cancel` — aborts the run; status → `cancelled`.
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

(Foundation declared a minimal reserved `ScrapeResult` in `state/types.ts`; this stage extends that interface to the full shape above.)

## Portal integration

- **Scrape action**: extend `StageActionArea` (stage-2 reusable slot) with the `"scrape"` branch — replace the search bar with a **Scrape** button.
- **State**: add the run-status concept Foundation reserved. Extend flow state/reducer with scrape run status (status, processed/total, summary) and a way to **merge `ScrapeResult` into articles by `id`** (e.g. a `setArticles` replace or a new `applyScrapeResults` action — implementer chooses; keep it reusable for later stages' result merges).
- **Run**: click Scrape → `startScrapeJob(articles)` → poll until terminal → merge results → update run-status UI (progress + summary counts). Keep Next **disabled while running**, enabled after completion **even if some articles failed**.
- Portal→worker calls go through a portal server route/action (worker URL stays server-side).

## Table display

- **Scraped** cell shows the check-mark only when `status === "success"` and content ≥ `200` chars (Foundation's `ScrapedCell` already renders empty otherwise).
- Check-mark opens a **modal**: scraped title, publisher URL, body source, extraction source, and content. Modal details are ephemeral.
- Failed scrapes leave the cell blank (failure details kept in run/dev state only).

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
- **Job registry / route**: start-job returns `jobId`; status transitions; cancel aborts; summary counts; results keyed by id. `supertest` for routes.
- **Portal**: scrape client (start/poll/cancel, mocked), result-merge-by-id, run-status UI, Next gating (disabled while running, enabled after completion incl. partial failure). `page.test.tsx` placement locks still pass.
- End of phase: type/lint, tests, build per `PLAN_AND_VET.md`.

## Risks / open questions

- **Playwright in the demo environment**: Chromium install + headless runtime are heavy; Google/publisher blocking is common, so real demos will produce `blocked_*` outcomes. The UI must degrade gracefully (failures don't block advancing). Confirm the demo host can run Playwright.
- **State contract additions**: this stage adds run-status state and a result-merge action to the Foundation reducer; confirm naming with the committed Search state before TODO creation.
- **worker-node test runner**: choose vitest (repo consistency) vs jest (source parity) — decide at TODO time.
- **Single-user assumption**: one scrape job at a time; the registry need not isolate concurrent sessions.
- **Per-article content size** travels portal→worker→portal in memory; acceptable for the bounded (≤ limit) demo set.
