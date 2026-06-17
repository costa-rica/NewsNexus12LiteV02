---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (claude-code)
modified_by: codex (gpt-5)
---

# Foundation / Portal Shell — TODO v02

Implementation task list for **stage 1 of 6** (Foundation / portal shell). It implements
`docs/20260615_portal_plan_v01.md` and only the PRD intro
(`docs/NewsNexus12LiteV02_prd.md`: "Overarching Flow & Table Evolution", "Data
Persistence & Ephemerality", "Visual Design Pattern", "Table requirements",
"Application Styling"). Build the empty-but-complete shell every later stage decorates.

> **Changes from v01 (this version):** Resolves Codex's qualifying concern about
> conflicting `TopBar` placement in Phase 5. v02 makes explicit that `layout.tsx` mounts
> only providers and the global `html`/`body` structure (no visible chrome), and that
> `TopBar` is rendered **exactly once** by `page.tsx` inside the `SlideStage` composition
> alongside `FlowIndicator` and `ArticlesTable`, so all persistent regions participate in
> the slide wrapper. No other scope or guardrails changed.

## How to use this file

- Work top to bottom, one phase at a time. Do not start a phase until the previous
  phase's end-of-phase checks pass.
- At the end of **each** phase run the end-of-phase checks listed in that phase
  (type/lint → tests → build, where the infrastructure exists or was just created).
- If a check fails, fix the code so the functionality remains and the checks pass
  before moving on.
- After all phases pass, check off completed tasks and follow the final commit
  instruction (Phase 9). **Do not commit or push until then.**

## Roadmap context (read before writing code)

- This is part **1 of 6**. Full sequence: Foundation → Search → Scrape → Location →
  State → Semantic.
- The table renders **all 7 columns** from stage 1; later stages only populate cells —
  do not restructure or reorder the table.
- The portal↔worker-node **job/poll abstraction is introduced in stage 3 and reused** by
  stages 4 and 6. Stage 1 must leave room for run status but must **not** invent or
  pre-build any job/poll plumbing.
- All pipeline data is **ephemeral / in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build any later stage's feature.

## OUT OF SCOPE for this stage — do NOT implement (hard guardrails)

- ❌ No Google RSS search, no search bar behavior, **no server routes / API routes**, no
  fetching of any kind (stage 2).
- ❌ No scraping, **no `worker-node` app**, no Playwright/Cheerio, no job/poll contract
  (stage 3).
- ❌ No Hugging Face / OpenAI / model or external API calls, no rating, state, or
  semantic logic (stages 4–6).
- ❌ No durable persistence of any kind, ever: no database, no files written as app
  state, no `localStorage`, no `sessionStorage`, no cookies for app/pipeline data.
- ❌ Do not populate columns 4–7 (Scraped, Nexus Location Rating, State (AI Assigned),
  Nexus Semantic Rating) with real values — build only their empty / presentational
  rendering with a documented prop contract.
- ❌ Do not add per-stage job IDs, polling, worker calls, or real cross-stage navigation
  data flow.

---

## Phase 0 — Repository verification & scaffold decision

- [x] Confirm the repo is sparse: verify it contains only `AGENTS.md`, `CLAUDE.md`,
      `.gitignore`, and `docs/`, and that there is **no** existing `package.json`,
      `portal/`, or app directory. Verify presence/absence; do not presume.
- [x] Read `AGENTS.md` and follow its conventions (markdown frontmatter rules, commit
      guidance). Note the Python venv rule is not relevant to this stage.
- [x] Create the portal app under a top-level **`portal/`** directory (future-monorepo
      layout, so stage 3 can add a `worker-node/` sibling without restructuring). Do not
      scaffold at the repo root. Do not create `worker-node/`.
- [x] Ensure the repo `.gitignore` (or `portal/.gitignore`) excludes `node_modules/`,
      `.next/`, build output, and any local env files.

### End-of-phase checks (Phase 0)
- [x] No build/test infra exists yet — checks deferred to Phase 1.

---

## Phase 1 — Toolchain: Next.js + TypeScript + Tailwind + lint + test harness

- [x] Initialize the Next.js (App Router) app with React + TypeScript inside `portal/`.
      Pin a current stable Next.js + React + TypeScript + Tailwind +
      `@tanstack/react-table` version set and **record the chosen versions** in the
      `portal/package.json` (and note them in a short comment or the PR/commit body).
      The only hard requirements: App Router support and TanStack Table v8-style
      column / `useReactTable` APIs.
- [x] Configure TypeScript (`tsconfig.json`) and a `type-check` script (e.g.
      `tsc --noEmit`).
- [x] Configure ESLint (Next.js + TypeScript rules) and a `lint` script. This lint/type
      config is inherited by all later stages — set it up cleanly now.
- [x] Configure Tailwind CSS (config + PostCSS + `globals.css` with Tailwind layers).
- [x] Add a test runner suitable for React component tests (e.g. Vitest or Jest +
      React Testing Library) and a `test` script with at least one trivial passing smoke
      test, so every later stage can run "type/lint → test → build".
- [x] Confirm `dev`, `build`, `start`, `lint`, `type-check`, and `test` scripts exist in
      `portal/package.json`.

### End-of-phase checks (Phase 1)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run the test runner (smoke test) — passes.
- [x] Run the production build — succeeds.

---

## Phase 2 — In-memory state layer (forward-compatible, no persistence)

- [x] Create `src/state/types.ts` with the forward-compatible `Article` type declaring
      **all** fields the later pipeline needs, so later stages assign into existing
      fields rather than reshape rows:
      - `id: ArticleId` (stable per-row id, the in-memory key for every later stage)
      - Stage 2 fields present now: `title`, `source`, `description`, `link`,
        `pubDate?`, `content?`
      - Reserved (declared, not implemented): `scrape?: ScrapeResult`,
        `locationRating?: number | null`, `stateAssignment?: StateAssignment`,
        `semanticRating?: number | null`
      - Declare `ScrapeResult` and `StateAssignment` as named, documented,
        forward-looking placeholder interfaces (intentionally not fully specified).
- [x] Define `StageKey = "search" | "scrape" | "location" | "state" | "semantic"` and a
      `FlowState` with `currentStage: StageKey` (starts at `"search"`) and
      `articles: Article[]` (empty in stage 1). Reserve the *concept* of per-stage run
      status with a comment, but do **not** implement runs, job IDs, or polling.
- [x] Create `src/state/flowReducer.ts` exposing at least `setStage`, `setArticles`, and
      `resetFlow`. `resetFlow` must clear `articles` and all ephemeral fields back to
      empty and return `currentStage` to `"search"` — this is the ephemerality
      enforcement mechanism; build it now even though there is nothing to clear yet.
- [x] Create `src/state/FlowContext.tsx` providing the flow state + dispatch via React
      Context (Context + reducer or equivalent lightweight in-memory store). **No**
      database, no local/session storage, no files.
- [x] Create `src/lib/pipeline.ts` as the single source of ordered stage metadata: the
      five stages in order (Search, Scrape, Location, State, Semantic) with labels,
      keys, and the per-stage background tint tokens used by the flow indicator and
      slide tint. Keep all stage-specific colors/labels here only.

### End-of-phase checks (Phase 2)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 3 — Persistent table: all 7 columns defined once (TanStack)

- [x] Create `src/components/tables/columns.tsx` as the **single source of truth** for
      column definitions, in this exact order with these header labels:
      1. **Title** — clickable; renders a link opening `link` in a new tab (operates on
         empty/placeholder data in stage 1).
      2. **News Source**
      3. **Description**
      4. **Scraped** — check-mark + modal-trigger rendering stub.
      5. **Nexus Location Rating** — colored rating-circle stub.
      6. **State (AI Assigned)** — text/link cell stub.
      7. **Nexus Semantic Rating** — colored rating-circle stub.
- [x] Create presentational cell components with documented prop contracts, consumed by
      later stages (no data wired now):
      - `src/components/tables/cells/RatingCircle.tsx` — pure presentational compact
        circle with centered text; green intensity scales with a normalized `0..1`
        score (higher = greener, lower = duller/darker), mirroring
        `TableReviewArticles.tsx`. Consumed by stages 4 and 6.
      - `src/components/tables/cells/ScrapedCell.tsx` — check-mark + modal hook stub
        (populated in stage 3).
      - `src/components/tables/cells/StateCell.tsx` — state text stub (populated in
        stage 5).
- [x] Create `src/components/tables/ArticlesTable.tsx` using `@tanstack/react-table`
      (`useReactTable`, the column defs from `columns.tsx`). Render **all 7 column
      headers in order** and an empty-state body (no rows, or a clear "no articles yet"
      empty-state message). Columns 4–7 render empty cells.
- [x] Do not add sorting/filtering/pagination behavior beyond what the empty shell needs
      (later stages own their behavior). Do not reorder or restructure columns.

### End-of-phase checks (Phase 3)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 4 — Persistent layout: top bar, flow indicator, slide mechanism, theme

- [x] Copy the logo asset into `portal/public/images/logoWhiteBackground.png` (reproduce
      / copy into the Lite repo rather than importing from any absolute external path,
      since the NewsNexus12 reference files live on another machine). If the asset is not
      reachable, add a clearly-named placeholder image at the same path and note it.
- [x] Create `src/components/layout/TopBar.tsx` — logo
      (`logoWhiteBackground.png`) + the text **"News Nexus Lite"** + the theme toggle.
      Persistent across all stages. `TopBar` is a self-contained component; it is **not**
      mounted by `layout.tsx`. It is rendered **exactly once**, by `page.tsx`, inside the
      `SlideStage` composition (see Phase 5) so it slides together with the flow indicator
      and table.
- [x] Create `src/components/layout/ThemeToggle.tsx` and a theme provider — implement
      dark and light themes with Tailwind color tokens for both. The toggle persists
      **only in memory** for the session (no storage), consistent with ephemerality.
      A default theme matching NewsNexus12 portal is fine. The theme **provider** is
      mounted in `layout.tsx` (Phase 5); the visible toggle control lives in `TopBar`.
- [x] Create `src/components/layout/FlowIndicator.tsx` — a horizontal timeline of the
      five stages driven by `lib/pipeline.ts`. Highlight the current stage; earlier
      stages may show a "complete" treatment. Include the **"Next" button** in this
      region, **disabled** in stage 1 (no data to advance, no later stage built). Stub
      the advance handler to dispatch `setStage` so later stages just enable the button
      under their own conditions.
- [x] Create `src/components/layout/SlideStage.tsx` — the slide/background transition
      **mechanism**: wraps its children and animates on `currentStage` change (the wrapped
      content — top bar, flow indicator, table — gives the impression of sliding right
      while the background animates left), and applies a per-stage background tint pulled
      from `lib/pipeline.ts` (lighter hue of blue in dark theme, darker hue of gray in
      light theme). `SlideStage` renders only whatever children it is given; it does not
      itself mount `TopBar`/`FlowIndicator`/`ArticlesTable` — `page.tsx` composes those as
      its children (Phase 5). Build the mechanism and per-stage color tokens so stage 2+
      only flips `currentStage`; real cross-stage navigation is not required yet.

### End-of-phase checks (Phase 4)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 5 — Page composition & wiring

> **Placement contract (resolves the v01 TopBar ambiguity).** There is exactly one
> rendered `TopBar`, and it lives inside the slide wrapper with the other persistent
> regions. Split responsibilities cleanly:
>
> - **`layout.tsx` = providers + global document structure only.** It renders the
>   `html`/`body` shell, mounts the theme provider and the `FlowContext` provider, pulls
>   in `globals.css`, and renders `{children}`. It must **not** render `TopBar`,
>   `FlowIndicator`, `ArticlesTable`, or `SlideStage`, and must **not** contain any
>   visible page chrome (no logo, no title text, no top-bar frame). This prevents the top
>   bar from being rendered twice or placed outside the slide wrapper.
> - **`page.tsx` = the single visible composition, all inside `SlideStage`.** It renders
>   `SlideStage` once and, as its children (in order), the three persistent regions:
>   `TopBar`, `FlowIndicator`, then `ArticlesTable`. Because all three are children of
>   `SlideStage`, they participate in the slide/background transition together, matching
>   the approved plan's slide behavior.

- [x] Implement `src/app/layout.tsx` (root layout): render the `html`/`body` structure,
      mount the theme provider and `FlowContext` provider, and import `globals.css`.
      **Do not** render `TopBar`, `FlowIndicator`, `ArticlesTable`, or `SlideStage` here,
      and do not add any visible top-bar frame or page chrome — `layout.tsx` provides
      providers and global structure only.
- [x] Implement `src/app/page.tsx` (the single demo page): render `SlideStage` **once**,
      and compose **inside** that `SlideStage` wrapper — as its children, in this order —
      the three persistent regions:
      1. `TopBar` (logo + "News Nexus Lite" + theme toggle) — rendered here exactly once,
      2. `FlowIndicator` sitting on **step 1 (Search)** with the disabled "Next" button,
      3. The `ArticlesTable` with all 7 columns and an empty-state body.
      Render `TopBar` exactly once (only here), and ensure all three regions are children
      of `SlideStage` so they slide together per the plan.
- [x] Confirm `globals.css` wires Tailwind layers + theme tokens and that the app renders
      with no console errors in `dev`.
- [x] Add **no** server routes / API routes in this stage.

### End-of-phase checks (Phase 5)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 6 — Minimal tests (lock the contract later stages depend on)

- [x] Add a test asserting the column **set and order** (all 7 headers, exact labels in
      the plan/PRD order) rendered by `ArticlesTable` / `columns.tsx`.
- [x] Add a test asserting `RatingCircle` color mapping (higher normalized score →
      greener; lower → duller/darker).
- [x] Add a test asserting `resetFlow` clears the in-memory article set and returns the
      flow to step 1 ("search") — confirming the ephemerality mechanism.
- [x] Add a lightweight test/interaction exercising that the `SlideStage` mounts and
      reacts to a `currentStage` change (e.g. via a dev/test trigger) without
      restructuring the table.
- [x] Add a test asserting the page renders **exactly one** `TopBar` and that the top bar,
      flow indicator, and table are all rendered within the `SlideStage` wrapper
      (locking the Phase 5 placement contract so a later change cannot duplicate the top
      bar or move it outside the slide wrapper).
- [x] Keep tests minimal but meaningful; do not test later-stage behavior that does not
      exist yet.

### End-of-phase checks (Phase 6)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 7 — Stage verification (manual + automated)

- [x] The portal installs and runs from a clean checkout: `dev` server starts and
      `build` succeeds (repo starts sparse).
- [x] The page renders the top bar (logo + "News Nexus Lite"), the flow indicator on
      **step 1 (Search)**, and the TanStack table showing **all 7 column headers in
      order** with an empty-state body.
- [x] Confirm the top bar appears **once** and that the top bar, flow indicator, and table
      sit inside the `SlideStage` wrapper (per the Phase 5 placement contract);
      `layout.tsx` renders providers/global structure only, with no visible chrome.
- [x] Both dark and light themes render, and the per-stage background tint token resolves
      correctly for each theme.
- [x] The slide-transition wrapper mounts and animates on a `currentStage` change without
      restructuring the table.
- [x] `resetFlow` clears the in-memory article set and returns the flow to step 1.
- [x] Confirm **no persistence** is introduced: no database, no file writes for app
      state, no `localStorage` / `sessionStorage` / cookie writes for pipeline/app data.
- [x] Re-confirm none of the OUT OF SCOPE items were implemented (no server routes, no
      worker-node, no scraping, no model/API calls, no durable persistence, columns 4–7
      empty/presentational only).

### End-of-phase checks (Phase 7)
- [x] Run type-check — passes.
- [x] Run lint — passes.
- [x] Run tests — pass.
- [x] Run the production build — succeeds.

---

## Phase 8 — Wrap-up checklist

- [x] All phases above complete and all end-of-phase checks pass.
- [x] Every task checkbox in completed phases is checked off.
- [x] No files outside the stage's scope were modified (this stage creates the `portal/`
      app and may update root `.gitignore`).

---

## Phase 9 — Commit (only after all tests/build pass)

- [x] After type/lint, tests, and build all pass, check off all completed tasks, then
      stage and commit all changes related to this stage. Follow `AGENTS.md` commit
      guidance: lowercase title ≤ 50 chars, a body explaining *why* and the main areas
      (this is a broad commit — new app, components, tests), reference this TODO file and
      its phases, and append the co-authored-by line for the implementing agent.
- [x] Do **not** push. Do **not** start stage 2 (Search) — stop after the stage 1 commit
      per `docs/20260615_build_sequence.md`.
