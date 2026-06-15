# NewsNexus12 Light v02 — Design Concept Document

This project will be a demo of the NewsNexus12 Weekly Orchestration. It should heavily reference the NewsNexus12 apps. The PRD will be created on the NicksMacBookAir.local machine and the NewsNexus12 project can be found in /Users/nick/Documents/NewsNexus12.

## Overarching Flow & Table Evolution

The user experience is built around a single, persistent data table that evolves through each stage of the analysis pipeline. The table serves as the central visual anchor, while the surrounding context — page title, action buttons, flow indicator — changes to reflect the current pipeline step.

The workflow follows this progression:

1. **Search** → User queries for articles via Google RSS
2. **Scrape** → Articles are scraped for full content
3. **Location Score** → Geographic relevance is calculated
4. **AI State Assigner** → State classification is determined
5. **Semantic Score** → Content relevance is scored

### Data Persistence & Ephemerality

This app is a demo. It does not intend to persist pipeline result data across sessions.

**Permanent data (intentionally kept):**

- Feature-extraction keywords (e.g. the semantic scorer keyword list)
- Default prompts used for AI steps (e.g. the OpenAI state-assignment prompt)

These are configuration/inputs to the demo and should survive restarts.

**Ephemeral data (intentionally NOT kept):**

- Google RSS query results and the working article set
- Scrape outcomes and scraped content
- Nexus Location Ratings
- AI State assignments
- Nexus Semantic Ratings
- Any user-edited prompt text (edits are used for the current run only and are not saved; new flows always start from the default prompt)

All ephemeral data lives in in-memory/working state for the duration of a single demo flow. A new flow or a reset clears it. Individual `Flow Requirements` subsections inherit this rule: where a section describes the full NewsNexus12 behavior of writing to a database, the Lite demo stores the equivalent outcome in in-memory working state instead, unless a later PRD requirement explicitly adds durable persistence.

### Visual Design Pattern

- **Persistent Table:** The same table structure carries through all steps. Columns populate progressively as each analysis stage completes.
- **Flow Indicator:** A visual timeline at the top shows all pipeline stages with the current step highlighted. As the user advances, the indicator updates to show completion. The next button is in the
- **Slide Transition:** When advancing to the next step, the table, top bar with Logo, and flow indicator remain will remain but the user will the impression it slides to the right with a subtle background color shift to indicate progression. The background will have an animation that slides to the left giving the impression the user is going to the right. There will be a new color that indicates the next step. The color will be a lighter hue of the blue (if theme is dark), and darker hue of gray (if theme is light)
- **Column Population:** Earlier steps' data remain visible; new columns fill in as the user progresses. Empty cells indicate data not yet available.

### Table requirements

Use the tanstack package to build the table. The table should have the following columns:

- "Title"
- "News Source"
- "Description"
- "Scraped"
- "Nexus Location Rating"
- "State (AI Assigned)"
- "Nexus Semantic Rating"

Use the /Users/nick/Documents/NewsNexus12/portal/src/components/tables/TableReviewArticles.tsx component as the style foundation and general funcitonality.
The columns for "Nexus Location Rating" use the same colored circles wiht the rating inside them. Similar to the /Users/nick/Documents/NewsNexus12/portal/src/components/tables/TableReviewArticles.tsx component. Follow the same design and style found in the TableReviewArticles.tsx component for the "State (AI Assigned)" and "Nexus Semantic Rating".

### Application Styling

Use the same Tailwind design as found in the NewsNexus12/portal app.

Use the /Users/nick/Documents/NewsNexus12/portal/public/images/logoWhiteBackground.png as the logo on the top bar and add text "News Nexus Lite".

---

## 1. Google RSS Query Section

### Purpose:

Allow users to search for and retrieve candidate articles from Google News RSS.

### Interaction Flow:

1. User lands on the homepage with a single search bar
2. User enters a search query (e.g., "fire")
3. System fetches articles from Google News RSS, limited by `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` (dotenv variable; default 10)
4. Results populate the table with columns: **Title**, **News Source**, **Description**
5. All other columns (Scraped, Location Score, AI State, Semantic Score, AI Approver) are empty/blank
6. **Title column is clickable** — clicking the title opens the article URL in a new tab
7. Flow indicator shows user is on step 1 (Search)
8. A "Next" button is enabled in the top Flow Indicator.

### Table Columns (at this step):

- "Title" (populated by Google RSS, with clickable linke to article)
- "News Source" (populated by Google RSS)
- "Description" (populated by Google RSS)
- "Scraped" (empty)
- "Nexus Location Rating" (empty)
- "State (AI Assigned)" (empty)
- "Nexus Semantic Rating" (empty)

### Flow Requirements: Google RSS Collection

The Lite Google RSS collection should imitate the interactive NewsNexus12 portal flow from `portal/src/app/(dashboard)/articles/get/google-rss/page.tsx`, with the search controls simplified for the demo.

1. Source flow to imitate

- The NewsNexus12 portal page collects search criteria, validates that at least one criterion exists, and sends a `POST` request to `/google-rss/make-request`.
- The API route builds a Google News RSS query, fetches the RSS XML, parses the returned items, and sends the parsed articles back to the portal as a preview response.
- The portal stores the returned `url`, maps each returned article into local table state, and displays the articles without saving them automatically.
- The full NewsNexus12 page also supports selecting rows and adding selected articles to the database through `/google-rss/add-to-database`. For the Lite demo, this database-ingestion behavior is source context only and should not be implemented.

2. Lite ephemerality adjustment

- The Lite demo should collect Google RSS articles only into the current in-memory working article set.
- The Lite demo should not call or implement `/google-rss/add-to-database`.
- The Lite demo should not save Google RSS query results, selected rows, request URLs, RSS content, or returned article metadata to a database, files, local storage, browser storage, or any other persistent data solution.
- The generated Google RSS URL may be kept in state only so it can be displayed during the current demo flow.
- The query text may be kept in state only while the current search form or demo flow is active.
- A new flow, page refresh, or reset should clear the Google RSS query text, generated RSS URL, fetched articles, selected rows, and any RSS `content` copied into article state.
- The output of this step is the current working table, not a durable ingestion record.

3. Lite query input requirements

- Use one visible query input for the Google RSS search.
- Treat this input as the full app's `and_keywords` field.
- Do not show or collect separate `and_exact_phrases`, `or_keywords`, or `or_exact_phrases` controls.
- Send the unused criteria as empty strings, or omit them if the Lite API handler normalizes missing values to empty strings.
- Preserve AND behavior:
  - All comma-separated terms entered by the user should be required in the Google News query.
  - Empty terms should be trimmed and ignored.
  - A term that already has matching single or double quotes should keep those quotes.
  - A term containing spaces should be wrapped in double quotes before it is sent to Google News RSS, matching the NewsNexus12 query builder behavior.
- If the query input is blank after trimming, do not call Google RSS. Show a warning or inline error that asks the user to enter a search query.

4. Time range requirements

- Match the portal page's default search window by using `7d` as the default Google RSS time range.
- The first Lite version does not need a visible time-range control because the existing section requires a single search bar.
- The final Google query should append `when:7d` unless a later PRD requirement explicitly adds a user-editable time range.

5. Request construction requirements

- Build the same request shape used by the NewsNexus12 portal/API flow:

```json
{
	"and_keywords": "<user query>",
	"and_exact_phrases": "",
	"or_keywords": "",
	"or_exact_phrases": "",
	"time_range": "7d"
}
```

- Build the Google News RSS URL with the same base and locale parameters used in NewsNexus12:
  - Base URL: `https://news.google.com/rss/search`
  - Query parameter: `q=<normalized query with when:7d>`
  - `hl`: `GOOGLE_RSS_HL`, default `en-US`
  - `gl`: `GOOGLE_RSS_GL`, default `US`
  - `ceid`: `GOOGLE_RSS_CEID`, default `US:en`
- Keep the generated RSS URL in state so the app can display it like the full portal page does.

6. RSS fetch and parsing requirements

- Fetch the generated Google News RSS URL using a server-side request, not a browser request directly to Google.
- Use a timeout for the RSS request. The NewsNexus12 API path uses a 20 second timeout.
- Send a User-Agent header for the request. The NewsNexus12 API path uses `NewsNexus12API/1.0`.
- Parse the RSS XML response and read items from `rss.channel[0].item`.
- Map each RSS item into the demo article shape:
  - `title`: `item.title[0]`
  - `link`: `item.link[0]`
  - `description`: prefer the first anchor text from `item.description[0]`; otherwise strip HTML tags and use the plain text description
  - `source`: `item.source[0]._` when available, otherwise `item.source[0]`
  - `pubDate`: `item.pubDate[0]`
  - `content`: `item["content:encoded"][0]` when available
- The table only needs to show Title, News Source, and Description at this step, but the app should keep `link`, `pubDate`, and `content` in the article object for later pipeline steps.

7. Article limit requirements

- Limit the articles used by the Lite table to the `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` dotenv value.
- If `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` is missing, empty, not a positive integer, or otherwise invalid, default to `10`.
- Apply the limit after RSS parsing and before setting the table's article state.
- The limited article set should become the working set for the rest of the demo pipeline.
- The UI should not expose extra unshown articles through table pagination when they are beyond the configured limit.

8. Response and UI state requirements

- On success, store the response in a shape equivalent to the NewsNexus12 portal response:

```json
{
	"success": true,
	"url": "<generated Google RSS URL>",
	"articlesArray": ["<limited parsed article objects>"],
	"count": "<number of limited articles>"
}
```

- Set loading state while the request is in progress.
- Disable the request/search action while loading.
- Show the same general success outcome as the source flow: the user should know how many articles were fetched into the demo table.
- Display the generated Google RSS URL after a successful request.
- Do not clear the previous successful table data until a new request succeeds, unless the user explicitly starts a new flow/reset action.
- The Next button should become enabled only after the limited article working set has at least one article.

9. Error handling requirements

- If Google News returns HTTP 503, show a rate-limit message that tells the user Google News RSS is temporarily unavailable and they should retry later.
- For other non-OK RSS responses, show a request failed message and do not advance the flow.
- If XML parsing fails, show a request failed message and do not advance the flow.
- If the request succeeds with zero parsed articles, keep the user on step 1 and show an empty-state message in the table area.
- Error responses should not mutate the current working article set.

10. Source files researched for this section

- `/Users/nick/Documents/NewsNexus12/portal/src/app/(dashboard)/articles/get/google-rss/page.tsx`
- `/Users/nick/Documents/NewsNexus12/portal/src/components/tables/TableNewsOrgsGoogleRssFeed.tsx`
- `/Users/nick/Documents/NewsNexus12/portal/src/types/article.ts`
- `/Users/nick/Documents/NewsNexus12/api/src/routes/newsOrgs/googleRss.ts`
- `/Users/nick/Documents/NewsNexus12/api/src/modules/newsOrgs/queryBuilder.ts`
- `/Users/nick/Documents/NewsNexus12/api/src/modules/newsOrgs/rssFetcher.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/jobs/requestGoogleRssJob.ts`

---

## 2. Scraping Section

### Purpose:

Scrape full article content from the URLs identified in the search step, using the scraping logic from NewsNexus12's worker-node.

### Interaction Flow:

1. User advances from Search step via "Next" button
2. Background slides to left giving user impression that the table and they are are movign to the right
3. Page title updates to "Scrape Articles"
4. Flow indicator highlights step 2 (Scrape); step 1 (Search) is marked as complete
5. The search bar is replaced with a "Scrape" button
6. User clicks "Scrape"
7. System runs the article scraper (reusing the scraping approach from NewsNexus12 worker-node)
8. Scraped column is populated by scraper process, with a single check mark that is clickable to open a modal with scraped content

### Table Columns (at this step):

- "Title" (populated by Google RSS, with clickable linke to article)
- "News Source" (populated by Google RSS)
- "Description" (populated by Google RSS)
- "Scraped" (populated by scraper process)
- "Nexus Location Rating" (empty)
- "State (AI Assigned)" (empty)
- "Nexus Semantic Rating" (empty)

### Flow Requirements: Scraping

The Lite scraping flow should imitate NewsNexus12 worker-node's active `article-content-scraper-02` workflow. In NewsNexus12, this workflow treats the URL from Google RSS as a Google-owned article URL first, resolves that URL to the real publisher URL, then fetches and parses the publisher page for usable article text.

1. Source flow to imitate

- The source workflow is exposed by worker-node at `POST /article-content-scraper-02/start-job`.
- The route validates article-targeting input, enqueues one job in the shared worker queue, and returns a queued job response with `jobId`, `status`, and `endpointName`.
- The job initializes the database models, selects target articles, then calls the shared ArticleContents02 enrichment module.
- The source worker can select articles broadly by age/count or process explicit `articleIds`. For the Lite demo, process the articles already present in the Google RSS table instead of running broad database targeting.
- The source workflow is sequential. It processes one article at a time and respects cancellation through `AbortSignal`.
- The source workflow writes outcomes to `ArticleContents02`.

2. Lite ephemerality adjustment

- The Lite demo should not initialize NewsNexus12 database models for this step.
- The Lite demo should not select scrape targets from the full app's `Articles` table.
- The Lite demo should not write to `ArticleContents02` or any other durable scrape-content table.
- The Lite demo should not implement durable queue persistence for scrape jobs unless a later PRD requirement explicitly adds it.
- Use the source worker's queued job lifecycle as a UI model only: idle, running, completed, and failed can live in in-memory working state for the current demo flow.
- Store scrape outcomes, scraped content, publisher URLs, failure details, body source, and extraction source only in the table's in-memory article state.
- A new flow, page refresh, or reset should clear all scrape outcomes and scraped content.

3. Worker-node packages and libraries

- `express`: exposes the worker HTTP routes, including `/article-content-scraper-02/start-job`.
- `@newsnexus/db-models`: source-only dependency that reads `Articles` and persists `ArticleContents02` rows in the full app. The Lite demo should not require it for scraping persistence.
- `playwright`: launches headless Chromium for Google News navigation and publisher-page fallback rendering.
- `cheerio`: parses publisher HTML and extracts the article title/body text.
- Native `fetch`: performs direct publisher HTTP requests before using browser fallback.
- `winston`: logs workflow, retry, skip, and persistence details in the source worker. Lite may use normal app logging without durable scrape storage.
- `dotenv`: loads worker runtime configuration.
- `typescript`, `tsx`, `jest`, `ts-jest`, and `supertest`: support worker development and tests.
- `xml2js` and `exceljs`: are part of worker-node and are used by the Google RSS ingestion workflow, not by the active article-content scraper itself.
- `@huggingface/transformers`: is part of worker-node for semantic scoring, not scraping.
- `puppeteer`: is still listed in `worker-node/package.json`, and some README text references it, but the active ArticleContents02 scraper imports and uses Playwright Chromium. The Lite scraping implementation should follow the Playwright-based code path unless the project intentionally changes this later.

4. Input article requirements

- Each article entering the scrape step should include:
  - `title`
  - `description`
  - `link` or `url`
  - `source`
  - optional `pubDate`
  - optional RSS `content`
- Treat the Google RSS article URL as the `googleRssUrl`.
- If RSS `content` already exists and is at least `200` characters after cleanup, the Lite flow may mark the article as scraped from `rss-feed` without visiting the publisher. This mirrors the NewsNexus12 request-google-rss follow-up behavior.
- If RSS `content` is missing or shorter than `200` characters, run the Google-to-publisher scrape flow.
- If an article has no URL, mark it as skipped or failed with a clear message and do not block scraping the remaining articles.

5. Google News gatekeeping and publisher URL discovery

- Use Playwright Chromium to open the Google RSS article URL before fetching the publisher page.
- Create the browser context with a desktop Chrome-style user agent, `en-US` locale, `1440x900` viewport, and browser-like `Accept` / `Accept-Language` headers.
- Wait for `domcontentloaded`, then wait briefly after load before reading the page. The source worker uses:
  - Google navigation timeout: `30000ms`
  - Google post-load wait: `5000ms`
  - Google navigation retry count: `2`
- Classify the loaded Google page before trusting it. Treat the page as blocked when the final URL or HTML includes known Google/anti-bot patterns such as:
  - `consent.google.com`
  - `before you continue to google`
  - `to continue, please click`
  - `personalized content`
  - `consent bump`
  - `privacy & terms`
  - `access to this page has been denied`
  - `px-captcha`
  - `press & hold to confirm you are`
  - `human verification challenge`
  - `captcha.px-cloud.net`
- Also treat a generic Google News shell page as blocked when it contains Google News "stories for you" style content but no usable publisher metadata.
- The workflow should not try to solve captchas, click consent screens, or fake human verification. It should detect those outcomes, mark the scrape as failed, and preserve diagnostic details.
- After a non-blocked Google navigation, prefer the final browser URL if it is no longer Google-owned.
- If the final URL is still Google-owned, extract the publisher URL from the Google page in this order:
  - canonical link
  - `og:url`
  - JSON-LD `url` or `mainEntityOfPage`
  - first usable non-Google visible link
- Reject publisher URL candidates that are still owned by Google, including `google.com`, `www.google.com`, `news.google.com`, and `consent.google.com`.
- If no non-Google publisher URL is found, mark the scrape as failed with `no_publisher_url_found`.

6. Publisher fetching requirements

- Fetch the discovered publisher URL with direct HTTP first.
- Use browser-style headers and follow redirects.
- Classify the publisher response for blocked or anti-bot pages before parsing it.
- Treat the publisher response as blocked when it matches known Google/anti-bot patterns or multiple challenge indicators such as:
  - `access to this page has been denied`
  - `press & hold to confirm you are`
  - `before we continue...`
  - `human verification challenge`
  - `please check your network connection or disable your ad-blocker`
  - `reference id`
- Treat publisher HTML as incomplete if it is shorter than `500` characters or asks the user to enable JavaScript/cookies.
- If direct HTTP returns usable HTML, parse it immediately and do not open the publisher page in Playwright.
- If direct HTTP returns incomplete HTML, fall back to Playwright using the same browser context.
- If direct HTTP throws, retry the publisher fetch attempt. If all attempts throw, record `publisher_fetch_error`.
- The source worker uses these publisher settings:
  - Publisher navigation timeout: `20000ms`
  - Publisher post-load wait: `2500ms`
  - Publisher fetch retry count: `2`
- If Playwright does not improve the publisher HTML, keep the better direct HTTP result and record that fallback did not improve the page.
- If all publisher attempts fail, record `publisher_fetch_error`.

7. Article parsing requirements

- Parse publisher HTML with Cheerio-style DOM parsing.
- Remove non-content elements before extracting text:
  - `script`
  - `style`
  - `noscript`
  - `nav`
  - `header`
  - `footer`
  - `svg`
- Extract the title in this order:
  - `meta[property="og:title"]`
  - first `h1`
  - document `title`
- Extract body text from paragraph tags first.
- Keep paragraphs that are at least `20` characters.
- Join accepted paragraphs with blank lines, then normalize whitespace.
- If no useful paragraph text exists, fall back to normalized body text.
- Treat parsed content shorter than `200` characters as `short_content`.

8. Scrape result requirements for the Lite table

- Each article should receive a scrape result object that can populate the `Scraped` column and modal.
- Store at least these fields in local state:
  - `articleId` or local row id
  - `googleRssUrl`
  - `googleFinalUrl`
  - `publisherUrl`
  - `publisherFinalUrl`
  - `title`
  - `content`
  - `status`: `success` or `fail`
  - `failureType`
  - `details`
  - `extractionSource`
  - `bodySource`
  - `googleStatusCode`
  - `publisherStatusCode`
- Do not persist these fields beyond the current demo flow.
- Do not save scraped content, scrape failures, publisher URLs, or diagnostics to local storage, browser storage, files, or a database.
- Use the same failure type vocabulary as worker-node:
  - `blocked_google`
  - `blocked_publisher`
  - `no_publisher_url_found`
  - `navigation_error`
  - `publisher_fetch_error`
  - `short_content`
- Use the same extraction source vocabulary as worker-node:
  - `final-url`
  - `canonical`
  - `og:url`
  - `json-ld`
  - `fallback-link`
  - `none`
- Use the same body source vocabulary as worker-node:
  - `rss-feed`
  - `direct-http`
  - `playwright-publisher`
  - `google-page`
  - `none`
- Show a check mark in the `Scraped` column only when `status` is `success` and content is at least `200` characters.
- The check mark should open a modal showing the scraped title, publisher URL, body source, extraction source, and article content.
- Failed scrapes should leave the visible `Scraped` cell blank or show a non-success state only if the final design calls for visible failure diagnostics. The failure details should remain available in developer state/logs for later debugging.

9. Runtime and processing requirements

- Process articles sequentially to match the source workflow and reduce browser pressure.
- Apply a per-article timeout. The source worker default is `ARTICLE_CONTENT_02_ARTICLE_TIMEOUT_MS`, defaulting to `90000ms` with a minimum allowed value of `10000ms`.
- Reuse a Chromium session across articles instead of launching a new browser for every article.
- Recycle the browser session after a configured number of attempts or navigation errors. The source defaults are:
  - `ARTICLE_CONTENT_02_BROWSER_RECYCLE_ATTEMPTS`: `25`
  - `ARTICLE_CONTENT_02_BROWSER_RECYCLE_NAVIGATION_ERRORS`: `3`
- Continue processing later articles when one article fails.
- Summarize the run with counts equivalent to the source workflow:
  - articles considered
  - articles skipped
  - successful scrapes
  - failed scrapes
- The Lite UI should keep the Next button disabled while scraping is running and enable it after the scrape run completes, even if some articles failed.

10. Source files researched for this section

- `/Users/nick/Documents/NewsNexus12/worker-node/package.json`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/routes/articleContentScraper02.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/jobs/articleContentScraper02Job.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/config.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/enrichment.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/googleNavigator.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/googleClassifier.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/publisherExtractor.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/publisherFetcher.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/publisherClassifier.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/articleParser.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/navigationSessionManager.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/persistence.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/repository.ts`
- `/Users/nick/Documents/NewsNexus12/worker-node/src/modules/article-content-02/types.ts`

---

## 3. "Nexus Location Rating" Section

### Purpose:

Using the article's content from scraping or defaulting to the article description and logic from NewsNexus12's worker-python determing rating for the likelihood the events in teh article occurred in the united states.

### Interaction Flow:

1. User advances from Scriping step via "Next" button
2. Background slides to left giving user impression that the table and they are are movign to the right
3. Page title updates to "Nexus Location Rating"
4. Flow indicator highlights step 3 (Nexus Location Rating); step 1 (Search) and step 2 (Scrape) are marked as complete
5. The search bar is replaced with a "Start Rating" button
6. User clicks "Start Rating"
7. System runs the process using the Hugging Face zero-shot classification model used in the NewsNexus12 worker-python to score articles

### Table Columns (at this step):

- "Title" (populated by Google RSS, with clickable linke to article)
- "News Source" (populated by Google RSS)
- "Description" (populated by Google RSS)
- "Scraped" (populated by scraper process)
- "Nexus Location Rating" (populated by the location rating processe / hugging face model)
- "State (AI Assigned)" (empty)
- "Nexus Semantic Rating" (empty)

### Flow Requirements: Nexus Location Rating

[update this]

---

## 4. "State (AI Assigned)" Section

### Purpose:

Using the article's content from scraping or defaulting to the article description and logic from NewsNexus12's worker-node to determine the state the events in the article occured in if the article content reveals this.

### Interaction Flow:

1. User advances from Scriping step via "Next" button
2. Background slides to left giving user impression that the table and they are are movign to the right
3. Page title updates to "State (AI Assigned)"
4. Flow indicator highlights step 4 (State (AI Assigned)); step 1 (Search), step 2 (Scrape), and step 3 (Nexus Location Rating) are marked as complete
5. The search bar is replaced with a "Start Assigning States" button
6. User clicks "Start Assigning States"
7. System runs the process using OpenAI api used in the NewsNexus12 worker-node to assign states
8. This "page" will include a section in the bottom with the prompt used in to send the OpenAI request. The user will be able to edit it, before they click "Start Assigning States", but the default prompt alwasy appears on new flows, the edited prompt does not get saved.

### Table Columns (at this step):

- "Title" (populated by Google RSS, with clickable linke to article)
- "News Source" (populated by Google RSS)
- "Description" (populated by Google RSS)
- "Scraped" (populated by scraper process)
- "Nexus Location Rating" (populated by the location rating processe / hugging face model)
- "State (AI Assigned)" (populated by the OpenAI response)
- "Nexus Semantic Rating" (empty)

### Flow Requirements: State AI Assignment

### Description of OpenAI request flow used in the NewsNexus12 worker-node

[update this]

---

## 5. "Nexus Semantic Rating" Section

### Purpose:

Using the article's content from scraping or defaulting to the article description and logic from NewsNexus12's worker-node to calulcate the semantic rating.

### Interaction Flow:

1. User advances from Scriping step via "Next" button
2. Background slides to left giving user impression that the table and they are are movign to the right
3. Page title updates to "Nexus Semantic Rating"
4. Flow indicator highlights step 4 (Nexus Semantic Rating); step 1 (Search), step 2 (Scrape), step 3 (Nexus Location Rating), and step 4 (State (AI Assigned)) are marked as complete
5. The search bar is replaced with a "Start Rating" button
6. User clicks "Start Rating"
7. System runs the process using the Hugging Face feature extraction model used in the NewsNexus12 worker-node to give a rating articles
   - use the key words from /Users/nick/Documents/\_project_resources/NewsNexus12/utilities/semantic_scorer/NewsNexusSemanticScorerKeywords.xlsx
   - make a section below the table that displays the words from this excel file that are used in the rating process
   - instead of storing all the scores the flow should only take the highest score from any of the words in teh list

### Table Columns (at this step):

- "Title" (populated by Google RSS, with clickable linke to article)
- "News Source" (populated by Google RSS)
- "Description" (populated by Google RSS)
- "Scraped" (populated by scraper process)
- "Nexus Location Rating" (populated by the location rating processe / hugging face model)
- "State (AI Assigned)" (populated by the OpenAI response)
- "Nexus Semantic Rating" (populated by result of semantic score)

### Flow Requirements: Nexus Semantic Rating

[update this]

---
