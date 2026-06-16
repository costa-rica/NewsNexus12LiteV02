---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Search (Google RSS) — Plan V02

> **Changes from V01** (resolves `docs/20260615_search_plan_v01_assessment_codex.md`):
> 1. Article objects now carry the Foundation `id: ArticleId` (concern 1). The **route**
>    owns id assignment; ids are ephemeral.
> 2. Route and module paths corrected to the Foundation `portal/src` App Router layout
>    (concern 2).
> 3. The plan now binds to the Foundation TODO contract names. The Foundation-incompleteness
>    risk (concern 3) is handled at the **TODO gate**: do not create the Search TODO until
>    Foundation (stage 1) is implemented and committed per `docs/20260615_build_sequence.md`.
>    If the committed Foundation diverges from the contract names below, produce a V03.

## Roadmap context

- This is **part 2 of 6**. Full sequence: Foundation → **Search** → Scrape → Location → State → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§1 "Google RSS Query Section"** of `docs/NewsNexus12LiteV02_prd.md`.
- The table already renders **all 7 columns** from stage 1; this stage only populates **Title, News Source, Description** and leaves the rest empty. Do not restructure or reorder the table.
- The portal↔worker-node job/poll abstraction does **not** exist yet (introduced in stage 3). Search runs entirely in the **portal** — no worker-node, no jobs, no polling.
- All data is **ephemeral/in-memory**. Never add durable persistence (no DB, files, localStorage, sessionStorage, cookies).
- Stay within this stage's scope; do not touch reserved fields (`scrape`, `locationRating`, `stateAssignment`, `semanticRating`) or pre-build later stages.

## Goal

Let the user enter one query, fetch candidate articles from Google News RSS server-side, and populate the in-memory working article set / table with Title, News Source, and Description. Enable the flow indicator's Next button once ≥1 article is loaded.

## Foundation contract this stage binds to (from `docs/20260615_portal_todo_v02.md`)

This stage consumes — and must not re-create or reshape — the stage-1 deliverables:

- **Article type**: `portal/src/state/types.ts` — `Article` with `id: ArticleId` (stable in-memory key) plus stage-2 fields `title`, `source`, `description`, `link`, `pubDate?`, `content?`, and the reserved fields (`scrape?`, `locationRating?`, `stateAssignment?`, `semanticRating?`) which Search leaves unset.
- **State actions**: `portal/src/state/flowReducer.ts` — `setArticles` (write working set), `setStage` (advance), `resetFlow` (clears `articles` + ephemeral fields, returns to `"search"`).
- **State access**: `portal/src/state/FlowContext.tsx` (flow state + dispatch).
- **Flow / UI**: `StageKey` starts at `"search"`; `FlowIndicator` owns the **Next** button (disabled in stage 1, advance handler dispatches `setStage`). Stage metadata in `portal/src/lib/pipeline.ts`.
- **App root**: Next.js App Router under `portal/src/app/`. Stage 1 adds **no** server routes — Search introduces the first one.

If any of these names differ in the committed Foundation, update to the real names in a V03 before TODO creation.

## Source flow to imitate (NewsNexus12, read-only for parity)

- `portal/src/app/(dashboard)/articles/get/google-rss/page.tsx`
- `api/src/routes/newsOrgs/googleRss.ts`
- `api/src/modules/newsOrgs/queryBuilder.ts`
- `api/src/modules/newsOrgs/rssFetcher.ts`
- `portal/src/types/article.ts`

NewsNexus12 splits this across portal + api; in Lite it collapses into a **single portal server route** (a plain RSS fetch needs no worker-node). The `/google-rss/add-to-database` path is **out of scope** — do not implement it.

## Technology

- **portal**: Next.js App Router. The Search UI is a client component; the RSS fetch is a **Route Handler** (server) so the request to Google is server-side, not from the browser.
- **XML parsing**: `xml2js` (matches NewsNexus12). Read items from `rss.channel[0].item`.
- **HTTP**: native `fetch` with `AbortController` for the 20s timeout and a `User-Agent` header.
- **Config**: env vars via the Next.js server runtime (`process.env`). No persistence layer.

## Environment variables

| Var | Default | Use |
|-----|---------|-----|
| `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` | `10` | Max articles into the working set; invalid/non-positive → 10 |
| `GOOGLE_RSS_HL` | `en-US` | `hl` query param |
| `GOOGLE_RSS_GL` | `US` | `gl` query param |
| `GOOGLE_RSS_CEID` | `US:en` | `ceid` query param |

Document these in a `portal/.env.example`.

## Architecture & flow

1. **Client (Search step UI)**: one visible query input + a search action, rendered for `currentStage === "search"` within the existing `SlideStage` composition (this is the first stage to fill the per-stage action area; follow Foundation's placement contract — do not move `TopBar`/`FlowIndicator`/`ArticlesTable`). On submit, trim input; if blank, show inline warning and do **not** call the server. Otherwise set loading, disable the action, POST to the route.
2. **Route Handler** `portal/src/app/api/google-rss/make-request/route.ts` (`POST`):
   - Normalize the request body to the full criteria shape (unused fields → empty strings).
   - Build the normalized query and the Google RSS URL.
   - Fetch the URL server-side (20s timeout, `User-Agent: NewsNexus12API/1.0`).
   - Parse XML, map items, apply the limit, then **assign an ephemeral `id: ArticleId`** to each article.
   - Return the response shape.
3. **Client (on success)**: pass `articlesArray` (already full `Article` objects) to `setArticles`; display the generated `url` and fetched count. Next becomes enabled once `articles.length >= 1` (FlowIndicator's existing condition). On failure, keep prior table data and show the appropriate message.

## Key modules / functions (under `portal/src/lib/google-rss/`)

- **`buildGoogleRssQuery(criteria)`** — imitates `queryBuilder.ts`:
  - Treat the single input as `and_keywords`; the other three criteria are empty.
  - Split AND terms on commas; trim and drop empty terms.
  - A term already wrapped in matching single/double quotes keeps its quotes.
  - A term containing spaces is wrapped in double quotes.
  - Append `when:7d` (default 7d range; no visible control this version).
- **`buildGoogleRssUrl(query)`** — base `https://news.google.com/rss/search`, params `q`, `hl`, `gl`, `ceid` from env/defaults.
- **`fetchGoogleRss(url)`** — imitates `rssFetcher.ts`: server fetch, 20s `AbortController` timeout, `User-Agent` header; returns a typed failure on non-OK/timeout.
- **`parseRssItems(xml)`** — `xml2js` parse, read `rss.channel[0].item`, map each item:
  - `title`: `item.title[0]`
  - `link`: `item.link[0]`
  - `description`: first anchor text from `item.description[0]`, else HTML-stripped plain text
  - `source`: `item.source[0]._` if present else `item.source[0]`
  - `pubDate`: `item.pubDate[0]`
  - `content`: `item["content:encoded"][0]` when present
- **`applyArticleLimit(items)`** — parse/validate `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` (positive int, else 10); slice after parsing, before id assignment. UI must not surface beyond-limit rows via pagination.
- **`assignArticleIds(items)`** (route-owned) — assign a stable ephemeral `id` typed as `ArticleId` (e.g. `crypto.randomUUID()` adapted to the `ArticleId` definition in `state/types.ts`). Ids are regenerated on each search and cleared by `resetFlow`; they are never persisted.

## Data shapes

Request body:
```json
{ "and_keywords": "<user query>", "and_exact_phrases": "", "or_keywords": "", "or_exact_phrases": "", "time_range": "7d" }
```

Returned article = a full Foundation `Article` (reserved fields unset):
```
{ id, title, source, description, link, pubDate?, content? }
```

Success response:
```json
{ "success": true, "url": "<generated url>", "articlesArray": [ /* limited Article objects with ids */ ], "count": <number> }
```

## UI behavior & states

- Single search bar on the Search step; Title column links open the article URL in a new tab (Foundation already renders the Title cell as a link).
- Loading state while fetching; search action disabled during load.
- On success: show how many articles were fetched and display the generated RSS URL.
- Do not clear previous successful table data until a new request succeeds or the user explicitly resets / starts a new flow (`resetFlow`).
- Next enabled only when the working set has ≥1 article.

## Error handling

- Blank query (after trim): inline warning, no server call.
- Google returns **503**: rate-limit message ("temporarily unavailable, retry later"); do not advance.
- Other non-OK responses or **XML parse failure**: request-failed message; do not advance.
- Success with **zero parsed articles**: stay on the Search step, show the table empty-state.
- Any error path must **not** mutate the current working article set.

## Ephemerality rules

- Collect articles only into the in-memory working set via `setArticles`.
- Do not call/implement `/google-rss/add-to-database`.
- Do not persist query text, generated URL, RSS content, ids, or article metadata anywhere durable.
- Generated URL and query text may live in component/flow state only for the current flow.
- New flow / refresh / `resetFlow` clears query text, URL, fetched articles, ids, and any RSS `content`.

## Out of scope

- Worker-node, jobs, polling (stage 3+).
- `add-to-database`, row selection for ingestion, multi-field criteria UI, user-editable time range.
- Scraped / Location / State / Semantic columns and reserved fields (later stages).

## Testing approach

- **Unit**: `buildGoogleRssQuery` (comma split, trim, quote preservation, space-wrapping, `when:7d`), `buildGoogleRssUrl` (param defaults), `applyArticleLimit` (invalid/missing env → 10), `parseRssItems` (fixture XML incl. anchor-vs-plain description, missing `source._`, missing `content:encoded`), `assignArticleIds` (every article gets a unique `ArticleId`).
- **Route**: mock fetch for success, 503, non-OK, malformed XML, zero items; assert response shape and that returned articles satisfy the `Article` type incl. `id`.
- End of phase: run type/lint checks, tests, and build per `PLAN_AND_VET.md`.

## Risks / open questions

- **`ArticleId` representation** (branded type vs plain string/number) is defined by Foundation; `assignArticleIds` must match it. Confirm against the committed `state/types.ts`.
- **Per-stage action area**: Foundation builds the persistent regions but may not expose a dedicated "stage action" slot. Confirm where the Search control mounts within `SlideStage` so later stages can swap it for their buttons without violating the Phase-5 placement contract.
- **Google News rate limiting** (503) during demos is realistic; the rate-limit message is the only in-scope mitigation.
