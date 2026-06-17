---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: codex (gpt-5)
---

# Search (Google RSS) — TODO v01

Implementation task list for **stage 2 of 6** (Search / Google RSS). It implements
`docs/20260615_search_plan_v02.md` and only PRD §1 "Google RSS Query Section"
(`docs/NewsNexus12LiteV02_prd.md`). It decorates the stage-1 portal shell: populate the
working article set and the first three table columns, and enable the flow indicator's
Next button.

## How to use this file

- Work top to bottom, one phase at a time. Do not start a phase until the previous phase's
  end-of-phase checks pass.
- At the end of **each** phase run the end-of-phase checks (type-check → lint → test →
  build). If a check fails, fix the code so functionality remains and checks pass before
  moving on.
- **Do not commit until Phase 6.** This mirrors the Foundation TODO pattern and
  `docs/20260615_build_sequence.md`: one commit per stage, then stop.

## Roadmap context (read before writing code)

- This is part **2 of 6**. Full sequence: Foundation → **Search** → Scrape → Location →
  State → Semantic.
- The table renders **all 7 columns** from stage 1; this stage only populates **Title,
  News Source, Description**. Do **not** reorder/restructure columns or touch reserved
  fields (`scrape`, `locationRating`, `stateAssignment`, `semanticRating`).
- The portal↔worker-node job/poll abstraction is introduced in **stage 3**. Search runs
  entirely in the portal: **one Next.js Route Handler**, no worker-node, no jobs, no
  polling.
- All data is **ephemeral / in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build scraping or rating behavior.

## Foundation contract (verified against committed `portal/src`, 2026-06-15)

Bind to these real names — they match search plan V02, so **no plan V03 is required**:

- `portal/src/state/types.ts` — `ArticleId = string`; `Article { id, title, source,
  description, link, pubDate?, content?, + reserved }`.
- `portal/src/state/flowReducer.ts` — action creators `setArticles(articles)`,
  `setStage(stage)`, `resetFlow()`.
- `portal/src/state/FlowContext.tsx` — `useFlow()` → `{ state, dispatch }`.
- `portal/src/lib/pipeline.ts` — `PIPELINE_STAGES`, `getNextStage`. Stage `"search"` is first.
- `portal/src/components/layout/FlowIndicator.tsx` — Next button is gated by a
  `canAdvance?: boolean` prop (default `false`); `page.tsx` currently renders it with no
  prop, so Search must supply `canAdvance`.
- `portal/src/components/tables/columns.tsx` — Title cell already renders `link` as a
  new-tab anchor; columns 4–7 render `null` when their field is unset.
- `portal/src/app/page.tsx` — server component composing
  `<SlideStage><TopBar/><FlowIndicator/><ArticlesTable/></SlideStage>`.
- `portal/src/app/page.test.tsx` — locks: exactly one `top-bar`; `top-bar`,
  `flow-indicator`, `articles-table-region` inside `slide-stage`; `data-current-stage`
  `"search"`; Next disabled in the empty initial state. **All must still pass.**

## OUT OF SCOPE for this stage — do NOT implement (hard guardrails)

- ❌ No worker-node, no Playwright/Cheerio, no job IDs, no polling (stage 3+).
- ❌ No `/google-rss/add-to-database`, no row selection for ingestion.
- ❌ No multi-field criteria UI (`and_exact_phrases` / `or_keywords` / `or_exact_phrases`
  as visible controls), no user-editable time range.
- ❌ No scraping, model, or OpenAI calls; do not populate columns 4–7 or reserved fields.
- ❌ No durable persistence of any kind: no DB, files, `localStorage`, `sessionStorage`,
  cookies. The generated URL / query text live only in component or flow state.
- ❌ Do not reorder/restructure the table or move `TopBar`/`FlowIndicator`/`ArticlesTable`
  outside `SlideStage`.

---

## Phase 0 — Preconditions & dependencies

- [x] Verify the build-sequence gate: Foundation (stage 1) is implemented, tested, and
      committed, and `portal/` builds/tests green from the current checkout. If Foundation
      has uncommitted changes or failing checks, stop and report — do not start Search.
- [x] Verify the Foundation contract files/names above exist as described (especially
      `Article`/`ArticleId`, the three action creators, `useFlow`, the `canAdvance` prop).
      If any name differs, stop and request a plan V03 before continuing.
- [x] Add runtime dep `xml2js` and dev dep `@types/xml2js` to `portal/package.json`;
      install. Pin explicit versions and note them in the commit body.
- [x] Add `portal/.env.example` documenting (with defaults):
      `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH=10`, `GOOGLE_RSS_HL=en-US`, `GOOGLE_RSS_GL=US`,
      `GOOGLE_RSS_CEID=US:en`. Confirm real `.env*` files stay gitignored.

### End-of-phase checks (Phase 0)
- [x] type-check passes · lint passes · tests pass · build succeeds (baseline still green).

---

## Phase 1 — Pure query / URL / limit modules (no network)

Create under `portal/src/lib/google-rss/`:

- [x] `types.ts` — `GoogleRssCriteria` (`and_keywords`, `and_exact_phrases`, `or_keywords`,
      `or_exact_phrases`, `time_range`) and `GoogleRssResponse`
      (`{ success: boolean; url?: string; articlesArray?: Article[]; count?: number;
      error?: string; errorCode?: "rate_limited" | "request_failed" | "empty_query" }`).
- [x] `queryBuilder.ts` — `buildGoogleRssQuery(criteria)` imitating
      `api/src/modules/newsOrgs/queryBuilder.ts`:
      - treat `and_keywords` as the only populated field; others empty;
      - split AND terms on commas; trim; drop empty terms;
      - keep a term's existing matching single/double quotes;
      - wrap a term containing spaces in double quotes;
      - append `when:7d`.
- [x] `url.ts` — `buildGoogleRssUrl(query)`: base
      `https://news.google.com/rss/search`, params `q`, `hl` (`GOOGLE_RSS_HL`||`en-US`),
      `gl` (`GOOGLE_RSS_GL`||`US`), `ceid` (`GOOGLE_RSS_CEID`||`US:en`).
- [x] `limit.ts` — `resolveArticleLimit()` reads/validates
      `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` (positive integer, else `10`); `applyArticleLimit`
      slices to that limit.
- [x] Unit tests: query builder (comma split, trim, quote preservation, space-wrapping,
      `when:7d`), URL param defaults, limit (missing/invalid/zero/negative → 10; valid →
      respected).

### End-of-phase checks (Phase 1)
- [x] type-check · lint · test · build all pass.

---

## Phase 2 — RSS fetch, parse, and id assignment

- [x] `rssFetcher.ts` — `fetchGoogleRss(url)` imitating
      `api/src/modules/newsOrgs/rssFetcher.ts`: native `fetch` with `AbortController`
      **20s** timeout and header `User-Agent: NewsNexus12API/1.0`. Distinguish: HTTP 503
      (→ `rate_limited`), other non-OK (→ `request_failed`), network/timeout error
      (→ `request_failed`). Return the raw XML body on success.
- [x] `parse.ts` — `parseRssItems(xml)` with `xml2js`: read `rss.channel[0].item`; map each:
      - `title` = `item.title[0]`, `link` = `item.link[0]`,
      - `description` = first anchor text from `item.description[0]`, else HTML-stripped
        plain text,
      - `source` = `item.source[0]._` if present else `item.source[0]`,
      - `pubDate` = `item.pubDate[0]`, `content` = `item["content:encoded"][0]` when present.
      Returns article data **without** `id`. Throw/return a typed parse failure on invalid
      XML or missing `rss.channel[0]`.
- [x] `mapArticles.ts` — `assignArticleIds(items): Article[]` adds
      `id: crypto.randomUUID()` per row, leaving reserved fields unset. Ids are ephemeral.
- [x] Unit tests with fixture XML: anchor-text vs plain-text description; missing
      `source._` (string fallback); missing `content:encoded`; invalid XML → typed
      failure; `assignArticleIds` produces unique ids and valid `Article` objects.

### End-of-phase checks (Phase 2)
- [x] type-check · lint · test · build all pass.

---

## Phase 3 — Route handler

- [x] `portal/src/app/api/google-rss/make-request/route.ts` — `POST`:
      1. parse body; normalize to `GoogleRssCriteria` (missing fields → empty strings,
         `time_range` default `"7d"`);
      2. if `and_keywords` is blank after trim → return `{ success:false,
         errorCode:"empty_query" }` (defensive; UI also guards);
      3. `buildGoogleRssQuery` → `buildGoogleRssUrl` → `fetchGoogleRss`;
      4. on fetch failure → `{ success:false, errorCode }`;
      5. `parseRssItems`; on parse failure → `{ success:false,
         errorCode:"request_failed" }`;
      6. `applyArticleLimit` → `assignArticleIds`;
      7. return `{ success:true, url, articlesArray, count }` (count may be 0).
- [x] Route tests (mock global `fetch`): success XML → shaped response with `Article`s
      incl. `id`; HTTP 503 → `rate_limited`; other non-OK → `request_failed`; malformed XML
      → `request_failed`; zero items → `success:true, count:0`. Assert no persistence side
      effects.

### End-of-phase checks (Phase 3)
- [x] type-check · lint · test · build all pass.

---

## Phase 4 — Client UI & composition wiring

- [x] `portal/src/components/search/SearchBar.tsx` (`"use client"`): one visible query
      input + search button + status area. Behavior:
      - trim input; if blank → inline warning, **no** server call;
      - while loading → disable the search button, show loading state;
      - `POST` to `/api/google-rss/make-request` with the single query as `and_keywords`;
      - on `success` → `dispatch(setArticles(articlesArray))`, show fetched count and the
        generated `url`; if `count === 0` show a table/area empty-state message;
      - on `rate_limited` → show "Google News RSS temporarily unavailable, retry later";
      - on `request_failed`/network → show a request-failed message;
      - on any failure, **do not** mutate the current working set (keep prior table).
- [x] `portal/src/components/search/StageActionArea.tsx` (`"use client"`): reads
      `state.currentStage` via `useFlow`; renders `<SearchBar/>` when `"search"`. This is
      the reusable per-stage action slot that stages 3–6 will extend (do not build their
      branches now).
- [x] `portal/src/components/layout/FlowIndicatorBar.tsx` (`"use client"`): reads
      `useFlow`, renders `<FlowIndicator canAdvance={canAdvance} />` where
      `canAdvance = state.currentStage === "search" && state.articles.length > 0` (other
      stages default `false` until they own their gate). Does **not** modify
      `FlowIndicator.tsx`.
- [x] Edit `portal/src/app/page.tsx`: replace `<FlowIndicator/>` with
      `<FlowIndicatorBar/>` and insert `<StageActionArea/>` inside `<SlideStage>` (above
      `<ArticlesTable/>`). Keep exactly one `TopBar`, all regions inside `SlideStage`, and
      column order unchanged.
- [x] Component tests: blank query → warning shown, `fetch` not called; success (mock
      fetch) → table shows Title/News Source/Description, generated URL + count visible,
      Next becomes enabled; `rate_limited` and `request_failed` → correct messages, table
      unchanged; confirm `page.test.tsx` still passes (one top-bar, regions in
      `slide-stage`, Next disabled when articles empty).

### End-of-phase checks (Phase 4)
- [x] type-check · lint · test · build all pass.

---

## Phase 5 — Stage verification (manual + automated)

- [x] From a clean install, `dev` runs and `build` succeeds.
- [x] Enter a query → table populates **Title, News Source, Description**; columns 4–7
      stay empty; Title links open the article in a new tab.
- [x] Generated RSS URL and fetched count are displayed; Next enables once ≥1 article and
      advancing dispatches `setStage` to `"scrape"` with the table persisting.
- [x] Blank query shows the inline warning and makes no request.
- [x] `resetFlow` clears query text, generated URL, and the working set, returning to
      `"search"`.
- [x] Confirm **no persistence** added and **no out-of-scope** work: no worker-node, no
      `add-to-database`, no jobs/polling, columns 4–7 untouched, table not restructured.

### End-of-phase checks (Phase 5)
- [x] type-check · lint · test · build all pass.

---

## Phase 6 — Commit (only after all checks pass)

- [x] All phases complete; all end-of-phase checks green; every checkbox above checked off;
      no files outside this stage's scope modified beyond the documented `page.tsx`
      wiring, `package.json`, and `.env.example`.
- [x] Stage and commit per `AGENTS.md` (broad commit — new route, lib modules, components,
      tests): lowercase title ≤ 50 chars, body explaining *why* + main areas, reference
      this TODO file and its phases, append `co-authored-by: <agent name> (<model>)`.
- [x] Do **not** push. Do **not** start stage 3 (Scrape) — stop after the stage 2 commit
      per `docs/20260615_build_sequence.md`.
