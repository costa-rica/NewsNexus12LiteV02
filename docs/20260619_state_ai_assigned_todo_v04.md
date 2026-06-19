---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# State (AI Assigned) — TODO V04

Implementation task list for **§4 "State (AI Assigned)" Section** of
`docs/NewsNexus12LiteV02_prd.md` (lines 641–901), derived from
`docs/20260619_state_ai_assigned_plan_v01.md`. This is **stage 5 of 6** in
`docs/20260615_build_sequence.md` (Foundation → Search → Scrape → Location →
**State** → Semantic).

> **Do not begin implementation until this TODO has been assessed and accepted**
> per `docs/PLAN_AND_VET.md`. This file is implementation guidance only — writing
> code now is out of process.

## Changes from V03 (resolves `..._todo_v03_assessment_codex.md`)

This revision keeps every accepted V03 resolution intact (id-bearing merge,
default-prompt fallback, and the two-distinct-skip-cases rerun fix) and tightens
only the single qualifying concern Codex raised against V03.

**Concern: `FlowIndicatorBar` Next gating source is ambiguous after reruns.**
V03's Phase 5 task gave two instructions that can diverge. It first told the
implementer to enable `canAdvance` for the `state` step from the **current run
summary** (`summary.assigned + summary.noState > 0`), then added prose saying
already-completed rerun rows are excluded from the run yet still hold valid
assignments, so gating "reads from those assignments / summary tallies" and a
rerun that only re-touches failed rows must not regress gating. Those two
sources can disagree: a rerun that excludes already-completed rows and retries
only failed/skipped rows can finish `completed` with a fresh
`stateRun.summary.assigned + stateRun.summary.noState === 0`, which the explicit
summary formula would read as "block Next" even though the article set still
holds prior valid assignments. An implementing agent could reasonably pick
either interpretation.

**Resolution (article-set-derived gating — single source of truth).** V04 makes
`canAdvance` for the `state` step derive **solely from the current in-memory
article set**, never from the run summary counts:

> Next is enabled for the State step when **(a)** no run is active
> (`state.stateRun?.status` is not `"queued"`/`"running"` — i.e. no run is in
> progress) **and** **(b)** at least one article in `state.articles` currently
> has `article.stateAssignment?.resultStatus` equal to `"assigned"` or
> `"no_state"`.

This reads the same durable in-memory values the cells render, so it is correct
regardless of whether the valid assignments came from this run or a prior run,
and a rerun that only retries failed rows (producing no *new* valid assignments)
**cannot** regress gating — the prior `assigned`/`no_state` rows are still in
`state.articles`. The previous `stateRun.summary.assigned + summary.noState > 0`
formula is **removed** as the gating source; summary counts remain a
display-only readout in `StateBar` and must not drive `canAdvance`. The empty/
failed messaging stays in `StateBar` (when a run completed but the article set
holds no valid assignment, Next stays disabled and the bar shows the clear
failed/empty message). Affected tasks updated consistently: `FlowIndicatorBar`
gating (Phase 5) and the gating/rerun tests (Phase 5).

> **Why article-set-derived over summary-carried:** the alternative — carrying
> prior valid assignments forward into each new `stateRun.summary` — would
> require the orchestrator to re-count excluded rows into the fresh summary on
> every rerun, duplicating state that already lives unambiguously on
> `article.stateAssignment`. Deriving from the article set keeps one source of
> truth and matches what the table actually shows.

## Changes carried forward from V03 (resolved `..._todo_v02_assessment_codex.md`)

The V02→V03 rerun-skip resolution is unchanged in V04 and remains in force.
V03 split two unrelated "skip" situations that V02 had merged:

1. **Content-skip (no usable title/content).** A row that, after trimming, has
   **neither** a non-empty title **nor** usable content is part of the eligible
   set, produces a terminal result, and **may** emit a `StateAssignmentResult`
   whose `assignment.resultStatus === "skipped"`. This stores `"skipped"` on
   `article.stateAssignment` so the cell renders `N/A`. This is safe: such rows
   never held a completed assignment.

2. **Already-completed rerun-skip (`assigned` / `no_state`).** On a rerun within
   the same flow, a row that already holds a **completed** assignment
   (`resultStatus` `"assigned"` or `"no_state"`) is **excluded from the eligible
   set entirely**. The orchestrator MUST NOT call `assignArticleState` for it,
   MUST NOT build a `StateAssignmentResult` for it, and MUST NOT dispatch
   `applyStateAssignments` for it — its existing `article.stateAssignment` and
   rendered cell stay **unchanged**. It MAY be counted separately in the run
   summary (e.g. a distinct `alreadyAssigned` tally) if the implementer wants
   visibility, but that count is summary-only and must never round-trip through
   `applyStateAssignments`.

The practical rule that removes the ambiguity: **only content-skips ever emit a
`"skipped"` result; already-completed rerun rows are filtered out before the
loop and emit nothing.** `failed` and (content-)`skipped` rows from a prior run
carry no completed assignment, so they remain eligible and are retried, per the
plan's rerun contract (`docs/20260619_state_ai_assigned_plan_v01.md` §"Input
article selection").

## Changes carried forward from V02 (resolved `..._todo_v01_assessment_codex.md`)

These two resolutions are unchanged in V04 and remain in force:

1. **Id-bearing merge contract.** The domain `StateAssignment` stays id-free. A
   wrapper type **`StateAssignmentResult = { articleId: string; assignment:
   StateAssignment }`** is the payload the reducer merges by, mirroring how
   `ScrapeResult` carries `articleId` and `LocationScore` carries `article_id`.
   The client `assignArticleState(...)` returns a bare `StateAssignment`; the
   orchestrator (`StateBar`), which already holds `article.id`, pairs it into a
   `StateAssignmentResult` before dispatching `applyStateAssignments`. The
   reducer merges **by `articleId`, never by loop position.**

2. **Unambiguous default-prompt fallback at the run trigger.** `StateBar` MUST
   resolve **`effectivePrompt = state.statePromptDraft ?? defaultPrompt`** once
   at the start of `handleStart`, then use that single value both to snapshot
   `stateRun.promptUsed` **and** as the `promptTemplate` passed to
   `assignArticleState`. A new/reset/refreshed flow (where `statePromptDraft` is
   unset) therefore runs with the default prompt and never posts an
   `undefined`/empty `promptTemplate`.

## Hard constraints (apply to every phase)

- **Lite isolation.** No runtime imports, HTTP calls, file reads, or DB usage
  from full NewsNexus12. The PRD `§4.10` source file list and the prompt path
  `/Users/nick/Documents/.../prompt.md` are **reference only** — never read them
  at runtime and never hardcode those absolute paths in code. Do **not** build
  the source `/state-assigner/start-job` worker route, the API automation proxy,
  or any of the targeting/selection fields (`targetArticleThresholdDaysOld`,
  `articleIds`, `articleIdMinExclusive`, …).
- **This stage does NOT use the worker-node job/poll abstraction.** The OpenAI
  call is a **portal server-side** concern. Do not add worker-node routes, job
  registry entries, or `start-job`/`/jobs/:jobId` plumbing.
- **Ephemerality.** All pipeline data is in-memory only. Never add durable
  persistence (no DB, file, localStorage, sessionStorage, browser storage,
  cookies, or queue records). Never persist the edited prompt, the final
  per-article prompts, raw/parsed OpenAI responses, reasoning, state names, or
  errors. Do **not** query or write `Articles`, `ArticleContents02`,
  `ArticleStateContract02`, `Prompts`, `States`, `ArtificialIntelligences`, etc.
- **Secrets & bodies.** Read `KEY_OPEN_AI` **server-side only**, in the assign
  route. Never log, return, or echo the key value. Never log the prompt, article
  title/content, the OpenAI request body, or the raw OpenAI response — log only
  identifiers, counts, statuses, and failure types (AGENTS.md "Logging").
- **No runtime dependency on full NewsNexus12 files/services/DBs.** The default
  prompt is an **embedded checked-in asset** copied verbatim from PRD `§4.3`.
- **Scope = State (AI Assigned) only.** Do not pre-build Nexus Semantic Rating
  (stage 6) or touch Search/Scrape/Location fields, the table column order, or
  the worker-node app.
- **Conventions.** Follow AGENTS.md: portal server code uses
  `portal/src/lib/serverLogger.ts` (no `console.*`); HTTP errors use the standard
  envelope via `errorJson` (`portal/src/lib/http/errors.ts`, see
  `docs/ERROR_REQUIREMENTS.md`); any new `docs/*.md` uses the dated lowercase
  filename + YAML frontmatter rules.

---

## Phase 1 — Data shapes & reducer (in-memory state)

- [ ] In `portal/src/state/types.ts`, replace the reserved minimal
      `StateAssignment` with the PRD `§6` shape:
  - `StateResultStatus = "assigned" | "no_state" | "failed" | "skipped"`.
  - `StateAssignment` fields: `occuredInTheUS?: boolean` (preserve source
    spelling exactly), `reasoning?: string`, `stateName?: string` (full U.S.
    state name or `""`), `rawStateText?: string`, `resultStatus:
    StateResultStatus`, `errorMessage?: string`. **No `articleId` on this type**
    — it is the id-free domain value stored at `article.stateAssignment`.
  - **Add the id-bearing merge wrapper**
    `StateAssignmentResult = { articleId: string; assignment: StateAssignment }`.
    Use the same id type the article carries (`article.id` is a `string`; if an
    `ArticleId` alias already exists in `types.ts`, reuse it for `articleId`
    rather than introducing a second id type). This wrapper — not
    `StateAssignment` — is what the reducer action merges by, mirroring how
    `ScrapeResult` carries `articleId` and `LocationScore` carries `article_id`.
  - Add `StateRunSummary` (`eligible`, `processed`, `assigned`, `noState`,
    `failed`, `skipped`) and `StateRunStatus` (`status: "idle" | "queued" |
    "running" | "completed" | "failed" | "cancelled"`, `processed`, `total`,
    `summary`, `promptUsed?: string`).
    - **Optional `alreadyAssigned` tally.** If the implementer wants visibility
      into rerun rows that were skipped *because they already hold a completed
      assignment* (case 2 above), add an `alreadyAssigned?: number` field to
      `StateRunSummary`. This count is **summary-only**: it is never derived from
      a `StateAssignmentResult` and never passes through `applyStateAssignments`,
      and it is **not** used by `canAdvance` (gating is article-set-derived, see
      Phase 5). If the implementer chooses not to surface it, omit the field —
      but the orchestrator must still exclude those rows from processing
      (Phase 4). Do **not** fold already-completed rerun rows into the `skipped`
      tally, which counts only content-skips.
  - Add `stateRun?: StateRunStatus` and `statePromptDraft?: string` to
    `FlowState`.
- [ ] Confirm no other consumer relies on the removed `confidence` field
      (grep; expected only `StateCell` + types). Update any that surface.
- [ ] In `portal/src/state/flowReducer.ts`, add actions + handlers mirroring the
      Location/Scrape pattern:
  - `setStateRun(stateRun)` — set `state.stateRun`.
  - `applyStateAssignments(results: StateAssignmentResult[])` — build a
    `Map<string, StateAssignment>` keyed by `result.articleId` (skip entries
    with a falsy `articleId`, mirroring the `applyScrapeResults` filter), then
    `state.articles.map(...)` writing `result.assignment` to
    `article.stateAssignment` for each matching `article.id`; leave non-matching
    articles untouched. **Merge by `articleId`, never by loop position.** The
    action creator signature is `applyStateAssignments(results:
    StateAssignmentResult[]): FlowAction`. This single action handles the
    terminal rows the orchestrator actually processes (`assigned` / `no_state` /
    `failed` / content-`skipped`) — the wrapper's `assignment.resultStatus`
    carries which. **The reducer is intentionally unaware of rerun
    already-completed rows**: the orchestrator never builds a result for them, so
    no reducer-side guard is required (and none should silently mutate completed
    rows). The reducer simply overwrites whatever id it is handed, which is why
    Phase 4 must not hand it an already-completed row's id.
  - `setStatePromptDraft(draft)` and `clearStatePromptDraft()` (or a single
    setter that accepts `undefined`) — in-memory draft only.
  - Extend `setArticles` and `resetFlow` to clear `stateRun` **and**
    `statePromptDraft` (so a new search / reset / fresh flow restores the
    default prompt). `resetFlow` already returns `createInitialFlowState()`;
    ensure the new fields default unset there.
- [ ] **Verification gate:** `npm run lint`, `npm run typecheck` (or
      `tsc --noEmit`), and the existing `flowReducer.test.ts` still pass. (Run
      from `portal/`; do not run installs.)

## Phase 2 — Pure libraries (prompt, states, parse) + unit tests

- [ ] `portal/src/lib/state-assigner/defaultPrompt.ts` — export the default
      template **verbatim** from PRD `§4.3` (lines 723–777), keeping the
      `{articleTitle}` and `{articleContent}` placeholders. Single source of
      truth for "default". No external path, no DB.
- [ ] `portal/src/lib/state-assigner/usStates.ts` — hardcoded U.S. state list
      (50 states + DC; include territories only if needed for source parity —
      finalize membership here) and a normalize helper that resolves a raw
      string **state-name first, then abbreviation** (PRD `§6`), returning `""`
      when unknown. No DB lookup.
- [ ] `portal/src/lib/state-assigner/prompt.ts` — pure
      `buildPrompt(template, { title, content })`; substitute both placeholders;
      if a placeholder is absent it is a no-op (run still proceeds, PRD `§3`).
- [ ] `portal/src/lib/state-assigner/parse.ts` — pure parse + normalize of an
      OpenAI completion into `StateAssignment` (the id-free domain value), no
      network/env:
  1. Missing `choices[0].message.content` → `"failed"`.
  2. `JSON.parse` content, tolerating a single leading/trailing markdown code
     fence (strip then parse); still-unparseable → `"failed"`.
  3. Require `occuredInTheUS` boolean + `reasoning` non-empty string; else
     `"failed"`.
  4. `occuredInTheUS === false` → **valid** `"no_state"`, `stateName: ""` (not a
     failure — matches source `stateId = null`).
  5. `occuredInTheUS === true`: full-name match → `"assigned"`; abbreviation
     match → normalize to full name `"assigned"`; missing/blank/unknown →
     `"no_state"` with `stateName: ""` and `rawStateText` preserved.
- [ ] Unit tests (vitest, existing patterns) colocated per current convention:
  - `defaultPrompt`: retains both placeholders, matches PRD text.
  - `prompt`: substitutes both; no-op when a placeholder removed; empty-string
    title/content.
  - `usStates`: name match, abbreviation match, name-before-abbreviation order,
    unknown → empty.
  - `parse`: missing content → failed; malformed JSON → failed; fenced JSON
    tolerated; missing required fields → failed; `false` → `no_state`;
    `true`+full name → assigned; `true`+abbreviation → normalized;
    `true`+blank/unknown → `no_state` with `rawStateText`.
- [ ] **Verification gate:** lint, typecheck, and the new unit tests pass.

## Phase 3 — Server route + client (OpenAI, server-side only)

- [ ] `portal/src/app/api/state-assigner/assign/route.ts` — `POST` handler.
      Body: `{ promptTemplate: string, title: string, content: string }`.
  - **Config/validation** → standard error envelope via `errorJson`: missing/
    blank `process.env.KEY_OPEN_AI` → `SERVICE_UNAVAILABLE` (503); malformed/
    invalid body → `VALIDATION_ERROR` (400). Treat a missing/empty
    `promptTemplate` as a `VALIDATION_ERROR` — the client guarantees a non-empty
    template (see Phase 4 `effectivePrompt`), so this branch is a guard, not the
    happy path. Never read/log the key value.
  - **Per-article handling:** `buildPrompt` → call
    `https://api.openai.com/v1/chat/completions` with the **exact source request
    shape** (PRD `§4.4`): `model: "gpt-4o-mini"`, single `user` message =
    substituted prompt, `temperature: 0.3`, **no** system message, **no**
    `response_format`. Apply a `10000ms` `AbortController` timeout (PRD `§8`).
  - Parse via `parse.ts`. **Article-level problems** (missing content, malformed
    JSON, missing required fields, abort/timeout, OpenAI non-2xx) return **HTTP
    200 with a `StateAssignment` whose `resultStatus: "failed"`** and a
    sanitized `errorMessage`, so the client records the failure and continues.
    Only config/validation problems use the error envelope. The route returns a
    bare `StateAssignment` (no `articleId`) — the orchestrator owns id pairing.
  - Logging via `serverLogger`: identifiers/counts/statuses/failure types only;
    **never** the prompt, content, request body, or raw response.
- [ ] `portal/src/lib/state-assigner/client.ts` — thin browser client
      `assignArticleState({ promptTemplate, title, content }, signal)` →
      `POST /api/state-assigner/assign`, **returning a bare `StateAssignment`**
      (no `articleId`; the caller pairs it into a `StateAssignmentResult`).
      Accept an `AbortSignal` for cancel. Throw a typed error (mirror the
      `WorkerRequestError` pattern in `jobClient.ts`) for config/validation
      envelope responses so the orchestrator can treat them as **run-level**
      failures.
- [ ] Route tests (mock `fetch`/OpenAI; **no real key, no network**): valid
      completion → normalized `StateAssignment`; missing `KEY_OPEN_AI` → error
      envelope; missing/empty `promptTemplate` → `VALIDATION_ERROR`;
      abort/timeout → 200 `failed`; OpenAI non-2xx → 200 `failed`; assert no
      secret/body logging (spy the logger).
- [ ] **Verification gate:** lint, typecheck, route tests pass.

## Phase 4 — UI: action bar, prompt editor, table cell

- [ ] `portal/src/components/state/StateBar.tsx` — action region for the State
      stage (analog of `LocationBar`). Owns the **client-orchestrated sequential
      loop**:
  - **Start Assigning States** button, disabled until the working set has ≥1
    article and while a run is active; **Cancel** button while running.
  - **Compute eligibility (PRD `§5`) with the two skip cases kept distinct:**
    1. **First, exclude already-completed rerun rows entirely.** A row whose
       existing `article.stateAssignment?.resultStatus` is `"assigned"` or
       `"no_state"` is **not eligible**: do not add it to the processing list,
       do not call `assignArticleState` for it, and do not build any
       `StateAssignmentResult` for it. Its existing `article.stateAssignment` and
       rendered cell must remain **untouched**. If a summary tally is desired,
       increment a separate `alreadyAssigned` counter for these rows — summary
       only, never via `applyStateAssignments`. (Rows whose existing status is
       `"failed"` or `"skipped"` carry no completed assignment and **remain
       eligible** — they are retried.)
    2. **Among eligible rows, content precedence:** successful scrape content
       (`article.scrape.content` with `scrape.status === "success"`) else
       `article.description`; title from the RSS article. A row that, after
       trimming, has **neither** a non-empty title **nor** usable content is a
       **content-skip**: it stays in the eligible/processed set and emits a
       `StateAssignmentResult` whose `assignment.resultStatus === "skipped"` (so
       the cell renders `N/A`). This is the **only** path that produces a
       `"skipped"` result — never use it for case 1.
  - **Resolve the prompt once, before snapshotting or calling:** compute
    `const effectivePrompt = state.statePromptDraft ?? defaultPrompt;` at the
    top of the start handler. Use this **same** `effectivePrompt` value both to
    set `stateRun.promptUsed` and as the `promptTemplate` argument to every
    `assignArticleState(...)` call. This makes a new/reset/refreshed flow (where
    `statePromptDraft` is unset) run with the default prompt and prevents posting
    an `undefined`/empty template. Do **not** read `statePromptDraft` directly at
    the call site.
  - On Start: snapshot `effectivePrompt` into `stateRun.promptUsed`; set status
    `running` (optional `queued`/`starting` tick); loop the **eligible** rows
    **sequentially**:
    - For a **content-skip** row, do not call OpenAI; build a
      `StateAssignmentResult` `{ articleId: article.id, assignment: {
      resultStatus: "skipped", ... } }` and dispatch
      `applyStateAssignments([result])`.
    - For a row with usable input, call `assignArticleState({ promptTemplate:
      effectivePrompt, title, content }, signal)` with a per-call
      `AbortController` (10s server timeout backs it). For the returned
      `StateAssignment`, **pair it with the row's id** into a
      `StateAssignmentResult` (`{ articleId: article.id, assignment }`) and
      dispatch `applyStateAssignments([result])`.
    - Dispatch progress via `setStateRun` as rows complete. Article-level
      failures/timeouts record the failure (`resultStatus: "failed"`, paired
      with its `articleId`) and **continue**.
    - (Batching the per-row dispatches is allowed as long as each entry keeps
      its `articleId`; never merge by loop position.)
    - **Reminder:** already-completed rerun rows from case 1 are never in this
      loop, so `applyStateAssignments` is never called with their id and their
      cells never change.
  - **Cancel:** abort the in-flight request and stop issuing new calls; mark
    `cancelled`. Already-assigned rows remain.
  - Run-level config error (typed client error) → stop loop, mark `failed`,
    show message.
  - **Empty/failed messaging.** When a run finishes and the **article set holds
    no valid assignment** (no row with `resultStatus` `"assigned"`/`"no_state"`
    — e.g. every processed row failed/content-skipped and there were no prior
    valid rows), show a clear failed/empty message; Next stays disabled (gating
    is computed by `FlowIndicatorBar` from the article set, Phase 5). This is a
    **display** decision in `StateBar`; it does not itself toggle `canAdvance`.
  - Progress label + summary readout (Eligible / Assigned / No state / Failed /
    Skipped, plus `Already assigned` if the optional tally is implemented)
    reusing the `LocationBar`/`ScrapeBar` status-card layout. **These summary
    counts are display-only and must not be used as the Next-gating source.**
- [ ] `portal/src/components/state/StatePromptEditor.tsx` — editable `<textarea>`
      rendered **below** the table. Value reads `state.statePromptDraft ??
      defaultPrompt` (same fallback rule the run trigger uses, so the displayed
      and executed prompts always agree); edits dispatch `setStatePromptDraft`.
      **Disabled while a run is active** (PRD `§3`).
- [ ] `portal/src/components/search/StageActionArea.tsx` — add the `"state"`
      branch → `<StateBar />` (mirror the existing `scrape`/`location` branches).
- [ ] `portal/src/app/page.tsx` — render the prompt editor **after**
      `<ArticlesTable />` via a small client wrapper that returns `null` unless
      `currentStage === "state"` (keeps the table above the editor, PRD `§3`).
- [ ] `portal/src/components/tables/cells/StateCell.tsx` — render by
      `assignment.resultStatus` (PRD `§7`): `undefined` (not run) → empty;
      `"assigned"` → full `stateName`, compact text-link treatment (keep
      existing link style); `"no_state"` → `No state`; `"failed"`/`"skipped"` →
      `N/A`. Column contract in `columns.tsx` is unchanged — do not edit
      `columns.tsx` ordering.
- [ ] *(Optional, only if time/scope allows)*
      `portal/src/components/tables/cells/StateModal.tsx` — detail modal (state
      value, `occuredInTheUS`, reasoning, current-run error), same pattern as
      `ScrapeModal`. Wire `StateCell` `onOpen` to it. All in-memory only. If
      added, keep the column contract unchanged.
- [ ] **Verification gate:** lint, typecheck pass; existing component/smoke
      tests still pass.

## Phase 5 — Flow gating, component/reducer tests, build

- [ ] `portal/src/components/layout/FlowIndicatorBar.tsx` — add a `state` clause
      to `canAdvance` that derives **solely from the current in-memory article
      set** (the V03→V04 fix). **Single, unambiguous rule:**
  - **Enable Next for the `state` step when both hold:**
    1. **No run is active** — `state.stateRun?.status` is **not** `"queued"` and
       **not** `"running"` (a finished/`completed`/`cancelled`/`failed`/`idle`/
       absent run all satisfy this; the point is no run is in progress); **and**
    2. **At least one article currently has a valid assignment** —
       `state.articles.some(a => a.stateAssignment?.resultStatus === "assigned"
       || a.stateAssignment?.resultStatus === "no_state")`.
  - **Do NOT gate on the run summary.** The V03 formula
    `summary.assigned + summary.noState > 0` is **removed** as the gating source.
    Summary counts (including any `alreadyAssigned` tally) are display-only in
    `StateBar`. Rationale: a rerun that excludes already-completed rows and
    retries only failed/skipped rows can complete with a fresh
    `summary.assigned + summary.noState === 0` while the article set still holds
    prior valid assignments. Reading the article set keeps Next enabled in that
    case (no regression) and is the same data the cells render.
  - **Behavioral consequences this rule must produce** (assert in tests):
    - While running (`"running"`/`"queued"`) → Next **disabled** regardless of
      how many valid assignments already exist.
    - First run completes with ≥1 `assigned`/`no_state` row → Next **enabled**.
    - First run where **every** row failed/content-skipped and no prior valid
      assignment exists → Next **disabled**; `StateBar` shows the failed/empty
      message.
    - Rerun that retries only `failed`/`skipped` rows, excludes the prior
      `assigned`/`no_state` rows, and produces **no new** valid assignment →
      Next **still enabled**, because the prior valid rows remain in
      `state.articles` (this is the exact case Codex flagged; gating must not
      regress).
    - Mixed results → Next **enabled**; failed rows stay visible as `N/A`.
- [ ] Reducer tests (`flowReducer.test.ts`): `setStateRun`;
      `applyStateAssignments` **merges by `articleId`** using the
      `StateAssignmentResult` wrapper (assert an out-of-order / partial-set batch
      lands on the correct `article.stateAssignment`, and that an unknown
      `articleId` is ignored — proving position-independent merge);
      `setStatePromptDraft`/clear; `setArticles` and `resetFlow` clear
      `stateRun` + `statePromptDraft`.
- [ ] **Rerun skip tests (carried from V03).** Add explicit coverage proving the
      two skip cases behave differently:
  - **Content-skip is stored:** a `StateAssignmentResult` whose
    `assignment.resultStatus === "skipped"` dispatched through
    `applyStateAssignments` writes `"skipped"` onto a row that previously had
    **no** completed assignment (cell would render `N/A`).
  - **Already-completed rerun-skip is untouched (orchestrator level):** in a
    `StateBar` test, seed an article whose `article.stateAssignment.resultStatus`
    is `"assigned"` (with a concrete `stateName`) and another that is
    `"no_state"`, alongside a `"failed"` row and a fresh row. Run the bar and
    assert:
    - `assignArticleState` is **not** called for the `assigned`/`no_state` rows;
    - no `applyStateAssignments` dispatch carries those rows' `articleId`;
    - after the run, the `assigned` row still has its original `stateName` and
      `resultStatus === "assigned"` (cell unchanged — **not** `N/A`), and the
      `no_state` row is still `"no_state"`;
    - the `"failed"` row and the fresh row **are** processed (eligible/retried).
  - **(If the `alreadyAssigned` summary tally is implemented):** assert the
    excluded rows increment `summary.alreadyAssigned` and are **not** added to
    `summary.skipped`.
- [ ] **Rerun gating regression test (the V03→V04 fix).** Add explicit coverage
      proving a rerun that excludes already-completed rows does **not** regress
      Next gating. This is the concrete behavior Codex required:
  - **Setup:** build a `FlowState` (or render `FlowIndicatorBar` with a state)
    whose `state.articles` contains **at least one** article with
    `stateAssignment.resultStatus === "assigned"` (or `"no_state"`) left over
    from a prior run, plus a `"failed"` row.
  - **Simulate the rerun outcome:** set `state.stateRun` to a `completed` run
    whose summary reflects **only** the retried failed row producing no new valid
    assignment — i.e. `summary.assigned === 0` and `summary.noState === 0`
    (the failed row stays failed). The prior `assigned`/`no_state` article is
    **not** re-emitted (it was excluded), so its `stateAssignment` is unchanged
    in `state.articles`.
  - **Assert:** `canAdvance` for the `state` step is **`true`** (Next enabled),
    proving gating reads the article set, not the fresh-run summary. A
    summary-formula implementation would have produced `false` here — that is the
    regression this test forbids.
  - **Counterpart negative test:** with the same `completed` run summary
    (`assigned + noState === 0`) but **no** article in `state.articles` holding a
    valid assignment, assert `canAdvance` is **`false`** (Next disabled) and the
    failed/empty message path applies — confirming the rule still blocks when the
    set genuinely has no valid assignment.
  - **Active-run negative test:** with `state.stateRun.status === "running"` (or
    `"queued"`), assert `canAdvance` is **`false`** even when valid assignments
    exist in the article set — proving condition (1) gates during a run.
- [ ] Component tests: `StateBar` gating (disabled until ≥1 article; Cancel +
      disabled Start while running) **and** default-prompt fallback (with
      `statePromptDraft` unset, the run snapshots `promptUsed === defaultPrompt`
      and posts a non-empty `promptTemplate`); `StatePromptEditor` seeds default
      (unset draft renders `defaultPrompt`) and is disabled during a run;
      `StateCell` rendering for each `resultStatus`; `FlowIndicatorBar`
      `canAdvance` for `state` (covered by the gating tests above).
- [ ] Smoke: existing `page.test.tsx` / smoke tests still pass.
- [ ] **Verification gate (full):** `npm run lint`, typecheck, **all** tests,
      and `npm run build` per `PLAN_AND_VET.md`. Fix any failures while
      preserving behavior, then check off tasks and commit per AGENTS.md commit
      guidance (reference this TODO + phase).

## Phase 6 — Docs & env example

- [ ] Confirm `KEY_OPEN_AI` is documented in the portal env example
      (e.g. `.env.example` / `.env.local.example` if present); add it if
      missing, **without** a real value. No other new env vars
      (`PATH_TO_STATE_ASSIGNER_FILES` is **not** needed — prompt is embedded).
- [ ] Update any stage-tracking/build-sequence note only if the repo convention
      requires marking stage 5 progress; do not invent new docs. Keep filename/
      frontmatter conventions (AGENTS.md).
- [ ] **Verification gate:** lint/build still green; commit doc/env changes.

---

## Manual verification (after automated gates)

- Enter the State stage from Location via **Next**; confirm step 4 highlights and
  steps 1–3 show complete, page title and slide already work.
- Edit the prompt, run with a small set; confirm sequential progress, the
  summary readout, correct cell values (state name / `No state` / `N/A` / empty),
  and Next gating (disabled while running; enabled on completion with ≥1 valid
  assignment in the article set; blocked when the set holds no valid assignment).
- **Without editing the prompt**, run on a fresh flow and confirm it uses the
  default prompt (no validation error, results populate) — proves the
  `statePromptDraft ?? defaultPrompt` fallback at the run trigger.
- **Rerun behavior:** after a first run that assigns some rows, click **Start
  Assigning States** again and confirm already-assigned (`assigned`/`no_state`)
  cells are left **unchanged** (not reset to `N/A`), previously failed rows are
  retried, and **Next stays enabled** even if the rerun produces no new valid
  assignment (the prior valid rows still gate advancement).
- Confirm **Cancel** aborts mid-run and keeps already-assigned rows.
- Confirm refresh / reset / new search restores the **default** prompt and clears
  all assignments and `stateRun`.

## Out of scope (do not implement here)

- Nexus Semantic Rating (stage 6) and any semantic field changes.
- worker-node changes, the source `/state-assigner/start-job` worker route, the
  API automation proxy, article-targeting/selection fields, `ArticleContents02`
  enrichment, and any DB/file/queue persistence.
- New worker job/poll/cancel routes (this stage uses a plain portal route).
- Saving/draft-persisting the edited prompt beyond current in-memory run state.
- A single long-lived streaming server route (rejected for V01 — see plan
  "Risks"; revisit only if the assessor requires it).
