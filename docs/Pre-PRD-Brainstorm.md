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

### Description of Scraping flow description from NewsNexus12/worker-node

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

### Description of Hugging Face zero-shot classification model used in the NewsNexus12 worker-python

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

### Description of Hugging Face feature-extraction model used in the NewsNexus12 worker-node

[update this]

---
