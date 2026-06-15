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
- The full NewsNexus12 page also supports selecting rows and adding selected articles to the database through `/google-rss/add-to-database`. For the Lite demo, the required behavior for this section is the collection and preview handoff into the persistent demo table. If persistence is added later, it should follow the full app's selected-article save behavior.

2. Lite query input requirements

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

3. Time range requirements

- Match the portal page's default search window by using `7d` as the default Google RSS time range.
- The first Lite version does not need a visible time-range control because the existing section requires a single search bar.
- The final Google query should append `when:7d` unless a later PRD requirement explicitly adds a user-editable time range.

4. Request construction requirements

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

5. RSS fetch and parsing requirements

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

6. Article limit requirements

- Limit the articles used by the Lite table to the `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` dotenv value.
- If `ARTICLE_LIMIT_GOOGLE_RSS_SEARCH` is missing, empty, not a positive integer, or otherwise invalid, default to `10`.
- Apply the limit after RSS parsing and before setting the table's article state.
- The limited article set should become the working set for the rest of the demo pipeline.
- The UI should not expose extra unshown articles through table pagination when they are beyond the configured limit.

7. Response and UI state requirements

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

8. Error handling requirements

- If Google News returns HTTP 503, show a rate-limit message that tells the user Google News RSS is temporarily unavailable and they should retry later.
- For other non-OK RSS responses, show a request failed message and do not advance the flow.
- If XML parsing fails, show a request failed message and do not advance the flow.
- If the request succeeds with zero parsed articles, keep the user on step 1 and show an empty-state message in the table area.
- Error responses should not mutate the current working article set.

9. Source files researched for this section

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

[update this]

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
