---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (claude-code)
modified_by: claude (claude-code)
---

# Foundation / Portal Shell — Plan v01

## Roadmap context

- This is part **1 of 6**. Full sequence: Foundation → Search → Scrape → Location → State → Semantic.
- The table renders **all 7 columns** from stage 1; later stages only populate cells — do not restructure the table.
- The portal↔worker-node **job/poll abstraction is established in stage 3 and reused** by stages 4 and 6 — do not fork it per stage. Stage 1 must not invent its own job/poll plumbing.
- All pipeline data is **ephemeral/in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build a later stage's feature.

This plan covers only the **Foundation / portal shell** stage, sourced from the PRD intro ("Overarching Flow & Table Evolution", "Data Persistence & Ephemerality", "Visual Design Pattern", "Table requirements", "Application Styling"). No search, scrape, rating, or AI behavior is implemented here. The deliverable is the empty-but-complete shell that every later stage decorates: the Next.js app, the persistent 7-column table, the flow indicator, the slide transition, the theme, and the forward-compatible in-memory state container.

## Purpose of this stage

Establish the single, persistent visual frame described in the PRD: a top bar (logo + "News Nexus Lite"), a flow indicator timeline of the five pipeline stages, and one TanStack table that carries through the entire demo. After this stage the app should render a working portal with an empty table (all 7 columns present, no rows or placeholder rows), a flow indicator sitting on step 1, working dark/light theming, and the slide/background transition mechanism — with no real data wired in yet. This is the scaffold the next five stages plug into without restructuring.

## Technology

- **Framework:** Next.js (App Router) with React and TypeScript. The PRD references the NewsNexus12 `portal` app, which is Next.js; the architecture note in `20260615_build_sequence.md` confirms portal = Next.js with light server routes. Stage 1 creates the app but adds **no** server routes yet (the first server route arrives in stage 2 for Google RSS).
- **Table:** TanStack Table (`@tanstack/react-table`) — the PRD explicitly requires "the tanstack package to build the table."
- **Styling:** Tailwind CSS, matching the NewsNexus12 `portal` design. The reference component for table styling and general functionality is `/Users/nick/Documents/NewsNexus12/portal/src/components/tables/TableReviewArticles.tsx`; the logo asset is `/Users/nick/Documents/NewsNexus12/portal/public/images/logoWhiteBackground.png`. Because this repo is sparse and may not have access to that machine's files at build time, the implementing stage should treat those paths as **style references to mirror**, copying the logo asset into the Lite repo's `public/` rather than depending on an absolute external path.
- **State:** In-memory React state only (Context + reducer, or an equivalent lightweight store). No database, no local/session storage, no files. This is mandated by the PRD ephemerality section and the roadmap context.

### Versions / dependency note

The implementing TODO should pin a current stable Next.js + React + TypeScript + Tailwind + `@tanstack/react-table` set and record the chosen versions. Nothing in this stage depends on a specific major version; the only hard requirements are App Router support and TanStack Table v8-style column/`useReactTable` APIs.

## Repository assumptions (sparse repo)

The repository currently contains only `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and `docs/`. There is **no** existing portal, `package.json`, or app directory. This plan therefore assumes the portal app is created from scratch in this stage and does **not** assume any pre-existing portal files. The implementing agent must verify (not presume) the absence/presence of files before creating them.

### Where the app lives

The architecture names two apps for the full project: `portal` (Next.js) and, later, `worker-node` (Express, introduced in stage 3). To keep stage 3 from restructuring the tree, scaffold the portal under a top-level **`portal/`** directory now (a future-monorepo layout), rather than at the repo root. The `worker-node/` sibling is added in stage 3; stage 1 does not create it. If the operator prefers a root-level single app instead, that is the one structural decision worth confirming before implementation — but the default in this plan is `portal/` to match the PRD's repeated references to a distinct portal app and to avoid a disruptive move in stage 3.

## File / app structure

Proposed structure created in this stage (illustrative, not a checklist):

```
portal/
  package.json
  next.config.*
  tsconfig.json
  tailwind.config.*
  postcss.config.*
  public/
    images/
      logoWhiteBackground.png        # copied from NewsNexus12 portal reference
  src/
    app/
      layout.tsx                     # root layout: theme provider, top bar frame
      page.tsx                       # the single demo page: top bar + flow indicator + table
      globals.css                    # Tailwind layers + theme tokens
    components/
      layout/
        TopBar.tsx                   # logo + "News Nexus Lite"
        FlowIndicator.tsx            # 5-stage timeline, current step highlight
        SlideStage.tsx               # wrapper providing the slide/background transition
        ThemeToggle.tsx              # dark/light switch
      tables/
        ArticlesTable.tsx            # TanStack table, all 7 columns
        columns.tsx                  # column definitions (single source of truth)
        cells/                       # presentational cells reused/extended by later stages
          RatingCircle.tsx           # colored circle w/ value (Location + Semantic stages)
          ScrapedCell.tsx            # check-mark + modal hook (populated in stage 2)
          StateCell.tsx              # state text (populated in stage 5)
    state/
      FlowContext.tsx                # provider for flow step + working article set
      flowReducer.ts                 # actions: setStep, setArticles, resetFlow, ...
      types.ts                       # Article + flow state shape (forward-compatible)
    lib/
      pipeline.ts                    # ordered stage metadata (labels, order, keys)
```

The intent: **column definitions, the article type, and the stage list each have exactly one home**, so later stages add behavior by populating cells and dispatching actions — never by re-declaring columns or reshaping the table.

## Table columns (all 7, defined once now)

Per the PRD "Table requirements", define all seven columns in `columns.tsx` in this exact order and with these header labels:

1. **Title** — clickable; opens the article URL in a new tab (wired to real data in stage 2; in stage 1 the accessor and link rendering exist but operate on empty/placeholder data).
2. **News Source**
3. **Description**
4. **Scraped** — check-mark + modal trigger; rendering stub present, populated in stage 3 (Scrape).
5. **Nexus Location Rating** — colored rating circle; rendering stub present, populated in stage 4.
6. **State (AI Assigned)** — text/link cell; rendering stub present, populated in stage 5.
7. **Nexus Semantic Rating** — colored rating circle; rendering stub present, populated in stage 6.

All seven columns render from stage 1 onward. Columns 4–7 show empty cells until their stage runs. The colored-circle cells (5 and 7) and the scraped check-mark/modal (4) are built as **presentational components with a documented prop contract now**, even though no data feeds them yet, so later stages only supply values. Do not restructure or reorder these columns in any later stage.

## Forward-compatible state shape

The working data is a single in-memory article set plus flow/run state. Define the `Article` type now with **all** fields the later pipeline will need, so later stages assign into existing fields rather than reshaping rows. Proposed shape (illustrative):

```ts
// Stable per-row id assigned at ingestion; used as the in-memory key by every later stage.
type ArticleId = string;

interface Article {
  id: ArticleId;

  // Stage 2 — Google RSS (populated later; present now)
  title: string;
  source: string;        // "News Source" column
  description: string;
  link: string;          // clickable Title target; kept for later steps
  pubDate?: string;
  content?: string;      // RSS content:encoded, kept for later steps

  // Stage 3 — Scrape (shape reserved; unset in stage 1)
  scrape?: ScrapeResult;

  // Stage 4 — Nexus Location Rating (raw 0..1 score; unset in stage 1)
  locationRating?: number | null;

  // Stage 5 — State (AI Assigned) (unset in stage 1)
  stateAssignment?: StateAssignment;

  // Stage 6 — Nexus Semantic Rating (best-keyword score; unset in stage 1)
  semanticRating?: number | null;
}
```

`ScrapeResult` and `StateAssignment` are declared as forward-looking placeholder interfaces here (named, documented, intentionally not fully specified) so stage 1 establishes the field names without pre-building later behavior. The flow/run state:

```ts
type StageKey = "search" | "scrape" | "location" | "state" | "semantic";

interface FlowState {
  currentStage: StageKey;          // starts at "search"
  articles: Article[];             // empty in stage 1
  // per-stage run status (idle/running/completed/failed/cancelled) is added by the
  // stage that needs it; stage 1 only reserves the concept, it does not implement runs.
}
```

The reducer exposes at least `setStage`, `setArticles`, and `resetFlow` in stage 1. `resetFlow` (and page refresh) must clear `articles` and all ephemeral fields back to empty — this is the mechanism that enforces PRD ephemerality, so it is built now even though there is nothing to clear yet.

Important: stage 1 does **not** add per-stage job IDs, polling, or worker calls. The portal↔worker-node job/poll abstraction is introduced in stage 3 and reused by stages 4 and 6; stage 1 must leave room for it (e.g. a place for run status) but must not fork or pre-build it.

## General flow / design (stage 1 behavior)

The single page composes three persistent regions inside the slide wrapper:

1. **Top bar** — logo (`logoWhiteBackground.png`) + the text "News Nexus Lite", plus the theme toggle. Persistent across all stages.
2. **Flow indicator** — a horizontal timeline of the five stages (Search, Scrape, Location, State, Semantic) driven by `lib/pipeline.ts`. The current stage is highlighted; earlier stages can render a "complete" treatment. The "Next" button lives in this indicator region (per PRD), and in stage 1 it is present but disabled — there is no data to advance and no later stage to advance into yet. The advance handler is stubbed to dispatch `setStage` so later stages just enable the button under their own conditions.
3. **Table region** — the persistent `ArticlesTable` with all 7 columns and an empty state (no rows, or a clear "no articles yet" empty-state message in the table body area).

### Slide transition

The PRD describes advancing to the next step as a perceived rightward slide of the table/top-bar/flow-indicator with a background animation sliding left, plus a subtle background color shift per step (a lighter hue of blue in dark theme, a darker hue of gray in light theme). Stage 1 builds the **mechanism** — a `SlideStage` wrapper that animates content on `currentStage` change and applies a per-stage background tint pulled from stage metadata — and demonstrates it structurally. It does not need real cross-stage navigation yet (there are no other stages implemented), but the transition component and the per-stage color tokens must exist so stage 2+ only flips `currentStage`.

### Theme

Dark and light themes are required because the slide background color depends on the active theme. Implement a theme provider + toggle and define the Tailwind color tokens for both themes. Default theme can match NewsNexus12 portal's default; the toggle persists only in memory for the session (no storage), consistent with ephemerality.

## Styling approach

- Mirror the NewsNexus12 `portal` Tailwind design system: reuse the same general spacing, typography, color palette, and table treatment found in `TableReviewArticles.tsx`. Because the reference files live on another machine, the implementing agent should reproduce the visual style (class patterns, circle-rating treatment, compact cells) rather than import from an unavailable path, and should copy the logo image into `portal/public/images/`.
- The colored rating circle (`RatingCircle.tsx`) must follow the `TableReviewArticles.tsx` pattern: a compact circle with centered text, green intensity scaling with the normalized 0..1 score (higher = greener, lower = duller/darker). Built as a pure presentational component now; consumed by stages 4 and 6.
- Keep all stage-specific colors and labels in `lib/pipeline.ts` so the flow indicator and slide tint stay consistent and single-sourced.

## Out of scope for this stage (explicit)

- No Google RSS search, no server routes, no fetching (stage 2).
- No scraping, no worker-node app, no job/poll contract (stage 3).
- No Hugging Face / OpenAI calls, no rating or state logic (stages 4–6).
- No durable persistence of any kind, ever.
- Do not populate columns 4–7 with real values; only build their empty/presentational rendering.

## Verification expectations (for the later TODO / implementation)

The implementing TODO for this stage should verify, at minimum:

- The portal app installs and runs (`dev` server starts; production `build` succeeds) from a clean checkout, since the repo starts sparse.
- TypeScript type-checks and the project's lint pass (set up lint/type config as part of this stage so later stages inherit it). Per AGENTS.md, end-of-phase checks are: type/lint, tests, build.
- The page renders the top bar (logo + "News Nexus Lite"), the flow indicator on step 1 (Search), and the TanStack table showing **all 7 column headers in order** with an empty-state body.
- Both dark and light themes render, and the per-stage background tint token resolves correctly for each theme.
- The slide-transition wrapper mounts and animates on a `currentStage` change (can be exercised via a temporary/dev trigger or a unit/interaction test) without restructuring the table.
- `resetFlow` clears the in-memory article set and returns the flow to step 1, confirming the ephemerality mechanism works.
- A minimal test (component or unit) asserts the column set/order and the `RatingCircle` color mapping, locking the contract later stages depend on.
- No persistence is introduced: confirm there are no database, file, local-storage, or session-storage writes.

Where test infrastructure does not yet exist, this stage should establish the minimal harness (test runner + one or two smoke tests) so every subsequent stage can run "type/lint → test → build" per AGENTS.md.
