---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Search (Google RSS) — Plan V01

## Roadmap context

- This is **part 2 of 6**. Full sequence: Foundation → **Search** → Scrape → Location → State → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§1 "Google RSS Query Section"** of `docs/NewsNexus12LiteV02_prd.md`.
- The table already renders **all 7 columns** from stage 1; this stage only populates **Title, News Source, Description** and leaves the rest empty. Do not restructure the table.
- The portal↔worker-node job/poll abstraction does **not** exist yet (introduced in stage 3). Search runs entirely in the **portal** — no worker-node, no jobs, no polling.
- All data is **ephemeral/in-memory**. Never add durable persistence (no DB, files, localStorage, sessionStorage).
- Stay within this stage's scope; do not pre-build scraping or rating columns.

## Goal

Let the user enter one query, fetch candidate articles from Google News RSS server-side, and populate the working article set / table with Title, News Source, and Description. Enable the flow indicator's Next button once ≥1 article is loaded.

## Dependencies / assumptions (from stage 1 Foundation)

This plan assumes Foundation already provides:

- The portal app (Next.js App Router) with top bar, logo, flow indicator (Next button), theming, and slide transitions.
- A shared in-memory **working article set** state container (React context or store) that the tanstack table renders from.
- The 7-column `TableReviewArticles`-styled table rendering empty cells for not-yet-populated columns.
- A `link`/`pubDate`/`content`-capable article object shape kept in state for later stages.

If any of these are missing, this stage must not silently re-create them; the operator should sequence Foundation first.

## Source flow to imitate (NewsNexus12)

The Lite flow imitates the NewsNexus12 portal `make-request` preview path, simplified to one input. Reference (read-only, for parity):

- `portal/src/app/(dashboard)/articles/get/google-rss/page.tsx`
- `api/src/routes/newsOrgs/googleRss.ts`
- `api/src/modules/newsOrgs/queryBuilder.ts`
- `api/src/modules/newsOrgs/rssFetcher.ts`
- `portal/src/types/article.ts`

NewsNexus12 splits this across portal + api. In Lite it collapses into a **single portal server route** (the OpenAI-key/heavy-work reasons that justify worker-node do not apply to a plain RSS fetch). The `/google-rss/add-to-database` path is **out of scope** — do not implement it.

## Technology

- **portal**: Next.js App Router. UI is a client component; the RSS fetch is a **Route Handler** (server) so the request to Google is server-side, not from the browser.
- **XML parsing**: `xml2js` (matches NewsNexus12). Read items from `rss.channel[0].item`.
- **HTTP**: native `fetch` with `AbortController` for the 20s timeout and a `User-Agent` header.
- **Config**: env vars via the Next.js server runtime (`process.env`). No new persistence layer.

## Environment variables

| Var | Default | Use |
|-----|---------|-----|
| `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` | `10` | Max articles into the working set; invalid/non-positive → 10 |
| `GOOGLE_RSS_HL` | `en-US` | `hl` query param |
| `GOOGLE_RSS_GL` | `US` | `gl` query param |
| `GOOGLE_RSS_CEID` | `US:en` | `ceid` query param |

Document these in the portal `.env` example.

## Architecture & flow

1. **Client (Search page / step 1 UI)**: one visible query input + a search action. On submit, trim input; if blank, show inline warning and do **not** call the server. Otherwise set loading, disable the action, POST to the route.
2. **Route Handler** `POST app/api/google-rss/make-request/route.ts`:
   - Normalize the request body to the full criteria shape (fill unused fields as empty strings).
   - Build the normalized query (query builder) and the Google RSS URL.
   - Fetch the URL server-side (20s timeout, `User-Agent: NewsNexus12API/1.0`).
   - Parse XML, map items to article objects, apply the limit.
   - Return the response shape.
3. **Client (on success)**: store `articlesArray` into the working article set, display the generated `url` and fetched count, enable Next once ≥1 article. On failure, keep prior table data and show the appropriate message.

## Key modules / functions

- **`buildGoogleRssQuery(criteria)`** — imitates `queryBuilder.ts`:
  - Treat the single input as `and_keywords`; `and_exact_phrases`, `or_keywords`, `or_exact_phrases` are empty.
  - Split AND terms on commas; trim and drop empty terms.
  - A term already wrapped in matching single/double quotes keeps its quotes.
  - A term containing spaces is wrapped in double quotes.
  - Append `when:7d` (default 7d time range; no visible control this version).
- **`buildGoogleRssUrl(query)`** — base `https://news.google.com/rss/search`, params `q`, `hl`, `gl`, `ceid` from env/defaults.
- **`fetchGoogleRss(url)`** — imitates `rssFetcher.ts`: server fetch, 20s `AbortController` timeout, `User-Agent` header; throws/returns typed failure on non-OK or timeout.
- **`parseRssItems(xml)`** — `xml2js` parse, read `rss.channel[0].item`, map each item:
  - `title`: `item.title[0]`
  - `link`: `item.link[0]`
  - `description`: first anchor text from `item.description[0]`, else HTML-stripped plain text
  - `source`: `item.source[0]._` if present else `item.source[0]`
  - `pubDate`: `item.pubDate[0]`
  - `content`: `item["content:encoded"][0]` when present
- **`applyArticleLimit(items)`** — parse/validate `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` (positive int, else 10); slice after parsing, before returning. UI must not surface beyond-limit rows via pagination.

## Data shapes

Request body:
```json
{ "and_keywords": "<user query>", "and_exact_phrases": "", "or_keywords": "", "or_exact_phrases": "", "time_range": "7d" }
```

Article object (table shows Title/News Source/Description; rest retained for later stages):
```
{ title, link, description, source, pubDate, content }
```

Success response:
```json
{ "success": true, "url": "<generated url>", "articlesArray": [ /* limited articles */ ], "count": <number> }
```

## UI behavior & states

- Single search bar on step 1; Title column links open the article URL in a new tab.
- Loading state while fetching; search action disabled during load.
- On success: show how many articles were fetched and display the generated RSS URL.
- Do not clear previous successful table data until a new request succeeds or the user explicitly resets/starts a new flow.
- Next button enabled only when the working set has ≥1 article.

## Error handling

- Blank query (after trim): inline warning, no server call.
- Google returns **503**: rate-limit message ("temporarily unavailable, retry later"); do not advance.
- Other non-OK responses or **XML parse failure**: request-failed message; do not advance.
- Success with **zero parsed articles**: stay on step 1, show table empty-state message.
- Any error path must **not** mutate the current working article set.

## Ephemerality rules

- Collect articles only into the in-memory working set.
- Do not call/implement `/google-rss/add-to-database`.
- Do not persist query text, generated URL, RSS content, selected rows, or article metadata anywhere durable.
- Generated URL and query text may live in state only for the current flow.
- New flow / refresh / reset clears query text, URL, fetched articles, selections, and any RSS `content`.

## Out of scope

- Worker-node, jobs, polling (stage 3+).
- `add-to-database`, row selection for ingestion, multi-field criteria UI, user-editable time range.
- Scraped / Location / State / Semantic columns (later stages populate them).

## Testing approach

- **Unit**: `buildGoogleRssQuery` (comma split, trim, quote preservation, space-wrapping, `when:7d`), `buildGoogleRssUrl` (param defaults), `applyArticleLimit` (invalid/missing env → 10), `parseRssItems` (fixture XML incl. anchor-vs-plain description, missing `source._`, missing `content:encoded`).
- **Route**: mock fetch for success, 503, non-OK, malformed XML, zero items.
- End of phase: run type/lint checks, tests, and build per `PLAN_AND_VET.md`.

## Risks / open questions

- **Foundation contract**: exact name/shape of the working-set state container and how the Next button reads "≥1 article" depend on stage 1. Confirm before todo creation.
- **Route path naming**: proposed `app/api/google-rss/make-request/route.ts` mirrors NewsNexus12's `/google-rss/make-request`; confirm this convention is acceptable for the portal.
- **Google News rate limiting** during demos (503) is realistic; the rate-limit message is the only mitigation in scope this stage.
