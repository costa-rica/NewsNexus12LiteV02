---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# State (AI Assigned) — Plan V01

## Roadmap context

- This is **part 5 of 6**. Full sequence: Foundation → Search → Scrape → Location → **State** → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§4 "State (AI Assigned)" Section** of `docs/NewsNexus12LiteV02_prd.md` (lines 641–901).
- The table renders **all 7 columns** from stage 1 (`portal/src/components/tables/columns.tsx`); this stage only **populates the existing `State (AI Assigned)` cell** (`stateAssignment` accessor → `StateCell`). Do **not** reorder/restructure the table or touch Search/Scrape/Location/Semantic fields.
- **This stage does NOT use the worker-node job/poll abstraction.** Per `docs/20260616_arch_assessment_claude.md` and the build sequence, the OpenAI state-assignment call is a **portal server-side** concern (light I/O, not heavy CPU). worker-node and its `start-job`/`/jobs/:jobId` contract are untouched here.
- All pipeline data is **ephemeral/in-memory** — never add durable persistence (no DB, file, localStorage, browser storage, or queue records).
- Stay within this stage's scope; do **not** pre-build Semantic Rating (stage 6).

## Lite isolation (hard constraint)

- No runtime imports, HTTP calls, or DB usage from full NewsNexus12. The PRD's `§4.10` source file list and the prompt path `/Users/nick/Documents/_project_resources/NewsNexus12/.../prompt.md` are **reference only** for parity — they must not be read at runtime or referenced as absolute paths in code.
- The PRD's `§4.1` source endpoints (`POST /state-assigner/start-job`, the API proxy `/news-orgs/automations/state-assigner/start-job`) and targeting fields (`targetArticleThresholdDaysOld`, `articleIds`, `articleIdMinExclusive`, …) describe the **NewsNexus12 worker flow we imitate, not endpoints Lite builds**. Lite processes the current in-memory working set and implements none of that targeting/selection layer.
- The default prompt text is **embedded as a checked-in asset** in the portal (copied verbatim from PRD `§4.3`), not loaded from any external path or synced into a `Prompts` table.

## Goal

For each article in the current in-memory working set (after Search → Scrape → Location), send one OpenAI request that asks whether the article's events occurred in the U.S. and, if so, which state. Parse the JSON response, normalize the state to a full U.S. state name, and populate the `State (AI Assigned)` column — storing everything in memory only.

## Technology & general flow

- **Portal (Next.js)** owns this stage end to end: UI, sequential orchestration, and a server-side route that calls OpenAI so `KEY_OPEN_AI` never reaches the browser.
- **OpenAI**: `POST https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`, `temperature: 0.3`, a single `user` message containing the substituted prompt, no system message and no `response_format` (the prompt forces JSON-only output) — exactly the source request shape (PRD `§4.4`).
- **Orchestration model (recommended): client-orchestrated, one server call per article.** The client loops the eligible rows sequentially; for each it `POST`s a short request to a portal route that performs one OpenAI call and returns the normalized assignment. Progress, sequential ordering, the per-article 10s timeout, and cancel all fall out naturally, and each HTTP request stays short — avoiding the long-single-request reverse-proxy timeout class of bug fixed for Location in `docs/20260617_worker_node_location_offload_plan_v01.md`.
  - *Alternative considered:* a single server route that loops all articles and streams progress (SSE). Rejected for V01: it reintroduces a long-lived upstream request, needs streaming plumbing the codebase doesn't have, and complicates cancel. Flagged under Risks if the assessor prefers it.

### End-to-end flow

1. User clicks **Next** on Scrape/Location and lands on the State stage (`currentStage === "state"`). Background slide + flow-indicator highlighting already work via existing `SlideStage`/`FlowIndicator`; step 4 highlights and 1–3 show complete with no new layout work.
2. The action region (top, where Search's bar lives) shows a **Start Assigning States** button instead of a search bar (PRD `§4` step 5). Below the articles table, an editable **prompt editor** shows the default template.
3. User optionally edits the prompt, then clicks **Start Assigning States** (disabled until the working set has ≥1 article).
4. Client snapshots the current (possibly edited) prompt into run state, computes the eligible rows, and processes them **sequentially**, dispatching progress + merging each assignment as it returns.
5. On completion, if ≥1 valid assignment exists, **Next** enables; otherwise the user stays on the step with a clear empty/failed message.

## Main components & modules

### New portal modules

| Path | Responsibility |
|------|----------------|
| `portal/src/lib/state-assigner/defaultPrompt.ts` | Exports the permanent default prompt template (verbatim from PRD `§4.3`, with `{articleTitle}` / `{articleContent}` placeholders). Single source of truth for "default". |
| `portal/src/lib/state-assigner/usStates.ts` | Known U.S. state list + lookup helper. Normalizes a raw state string to a full state name using **state-name first, then abbreviation** (PRD `§6`, mirroring the source lookup order). Returns empty when unknown. |
| `portal/src/lib/state-assigner/prompt.ts` | Pure `buildPrompt(template, { title, content })` — substitutes placeholders; if a placeholder is absent, it is a no-op (the run still proceeds, per PRD `§3`). |
| `portal/src/lib/state-assigner/parse.ts` | Pure parse + normalize of an OpenAI completion into the in-memory `StateAssignment` (see Data shapes). No network, no env. |
| `portal/src/lib/state-assigner/client.ts` | Thin browser client: `assignArticleState({ promptTemplate, title, content }, signal)` → `POST /api/state-assigner/assign`, returning a `StateAssignment` (or throwing a typed config/validation error). Mirrors the `WorkerRequestError` pattern from `jobClient.ts`. |
| `portal/src/app/api/state-assigner/assign/route.ts` | Server route: validates `KEY_OPEN_AI` present and body fields; builds the per-article prompt; calls OpenAI with a `10000ms` `AbortController` timeout; parses + normalizes; returns the `StateAssignment`. |
| `portal/src/components/state/StateBar.tsx` | Action region for the State stage: **Start Assigning States** / **Cancel** button, progress label, lifecycle/summary readout, warnings/errors. Owns the sequential orchestration loop (the analog of `LocationBar.handleRate`). |
| `portal/src/components/state/StatePromptEditor.tsx` | Editable `<textarea>` rendered **below** the table; seeded from the default template; disabled while a run is active. |
| `portal/src/components/tables/cells/StateModal.tsx` *(optional)* | Detail modal (state value, `occuredInTheUS`, reasoning, current-run error) — same pattern as `ScrapeModal.tsx`. Details are in-memory only. |

### Edited portal files

- `portal/src/state/types.ts` — expand `StateAssignment`; add `StateRunStatus` / `StateRunSummary`; add `stateRun` (and the in-memory prompt draft, see Data shapes) to `FlowState`.
- `portal/src/state/flowReducer.ts` — add `setStateRun`, `applyStateAssignments`, prompt-draft actions; clear state-stage fields on `setArticles` and `resetFlow`.
- `portal/src/components/search/StageActionArea.tsx` — add the `"state"` branch → `<StateBar />`.
- `portal/src/app/page.tsx` — render the prompt editor **after** `<ArticlesTable />` (a small client wrapper that returns `null` unless `currentStage === "state"`, keeping the table above the editor per PRD `§3`).
- `portal/src/components/tables/cells/StateCell.tsx` — extend to render `full state name` / `No state` / `N/A` / empty by `resultStatus` (see Table display). Column contract in `columns.tsx` is unchanged.
- `portal/src/components/layout/FlowIndicatorBar.tsx` — add a `state` clause to `canAdvance` (enabled when `stateRun.status === "completed"` and ≥1 valid assignment).

## Data / state shapes (in-memory only)

Replace the reserved minimal `StateAssignment` with the PRD `§6` shape:

```ts
type StateResultStatus = "assigned" | "no_state" | "failed" | "skipped";

interface StateAssignment {
  occuredInTheUS?: boolean;     // preserve source spelling exactly (PRD §4.4)
  reasoning?: string;
  stateName?: string;           // full U.S. state name, or "" when none/unknown
  rawStateText?: string;        // raw model "state" value, kept for diagnostics
  resultStatus: StateResultStatus;
  errorMessage?: string;        // current-run failure detail only
}
```

Run lifecycle (mirrors `ScrapeRunStatus` / `LocationRunStatus`):

```ts
interface StateRunSummary {
  eligible: number;   // rows selected for this run
  processed: number;  // rows that produced any terminal result
  assigned: number;   // occuredInTheUS true with a known state
  noState: number;    // valid completion, no concrete state
  failed: number;     // errors / malformed / timeouts
  skipped: number;    // no title+text, or already-assigned on rerun
}

interface StateRunStatus {
  status: "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";
  processed: number;
  total: number;            // eligible count
  summary: StateRunSummary;
  promptUsed?: string;      // snapshot of the prompt template used for THIS run
}
```

`FlowState` gains `stateRun?: StateRunStatus`. The **edited prompt draft** is in-memory current-state only (PRD `§9`). Recommended: a `statePromptDraft?: string` field on `FlowState`, cleared on `resetFlow` and `setArticles`, so the top button (`StateBar`) and the below-table editor (`StatePromptEditor`) share one value; `StatePromptEditor` falls back to the default template when the draft is unset. (Alternative: a dedicated `StateStageProvider` context — same effect, more files. Decide at TODO time; both keep the draft purely in React memory with no persistence.)

## OpenAI request route & server-side handling

- **Route:** `POST /api/state-assigner/assign`. Body: `{ promptTemplate: string, title: string, content: string }`.
- **Config validation:** if `process.env.KEY_OPEN_AI` is missing/blank → return the standard error envelope (`SERVICE_UNAVAILABLE`/`VALIDATION_ERROR` per `docs/ERROR_REQUIREMENTS.md`). Never read or log the key value. The client treats a config-error envelope as a **run-level** failure (stop the loop, mark `failed`).
- **Per-article handling:** substitute placeholders → call OpenAI with a `10000ms` `AbortController` (PRD `§8`) → read `choices[0].message.content`. Article-level problems (missing content, malformed JSON, missing required fields, abort/timeout, OpenAI non-2xx) return **HTTP 200 with a `StateAssignment` whose `resultStatus` is `"failed"`** and a sanitized `errorMessage`, so the client can record the failure and continue to the next row (PRD `§6`, `§8`). Only config/validation problems use the error envelope.
- **Logging (AGENTS.md):** use `serverLogger` for identifiers, counts, statuses, and failure types only. **Never** log the prompt, article content, the OpenAI request body, or the raw response.

## Prompt handling

- Default template lives in `defaultPrompt.ts` (permanent app config). On entering the stage / new flow / reset / refresh, the editor shows the default (PRD `§3`, `§9`).
- The editor is freely editable before a run; **disabled while a run is active** (PRD `§3`). Placeholders `{articleTitle}` / `{articleContent}` are preserved in the default; if the user deletes one, the run still proceeds and that field is simply not substituted (PRD `§3`).
- At run start, the client snapshots the current draft into `stateRun.promptUsed` so the UI can show which prompt produced the results. The draft is **never** persisted anywhere.

## Response parsing / normalization (`parse.ts`)

1. Missing `choices[0].message.content` → `resultStatus: "failed"`.
2. `JSON.parse` the content. To tolerate occasional fenced output, strip a leading/trailing markdown code fence before parsing (documented under Risks); on parse failure → `"failed"`.
3. Require `occuredInTheUS` (boolean) and `reasoning` (non-empty string); otherwise → `"failed"`.
4. `occuredInTheUS === false` → **valid** completion: `resultStatus: "no_state"`, `stateName: ""` (explicitly **not** a failure, matching the source's `stateId = null`, PRD `§6`).
5. `occuredInTheUS === true`:
   - `state` matches a known full name → `stateName` = that name, `resultStatus: "assigned"`.
   - `state` matches a known abbreviation → normalize to full name (`"assigned"`).
   - `state` missing/blank/unknown → `resultStatus: "no_state"`, `stateName: ""`, keep `rawStateText` for diagnostics.

## Input article selection (PRD §5)

- Eligible = current in-memory articles. **Content precedence:** successful scraped content (`article.scrape.content` with `scrape.status === "success"`) → otherwise `article.description`. Title comes from the RSS article object.
- If an article has **neither** a non-empty title **nor** usable content after trimming → `skipped`, continue.
- **Rerun within the same flow:** skip rows that already hold a completed assignment (`resultStatus` `assigned` or `no_state`); failed/skipped rows are retried (they carry no completed assignment). No rerun/reset UI control is required in V01 beyond the existing flow reset.
- Start button disabled until the working set has ≥1 article.

## Table display (PRD §7)

`StateCell` maps `assignment.resultStatus`:

- not run (`undefined`) → empty cell.
- `"assigned"` (has `stateName`) → full state name, compact text-link treatment (matches the existing `StateCell` link style / NewsNexus12 review table).
- `"no_state"` → `No state`.
- `"failed"` / `"skipped"` → `N/A`.
- If a `StateModal` is added, populated cells become a trigger showing state value, `occuredInTheUS`, reasoning, and any current-run error (in-memory only).
- If table sorting is enabled at this step, unset/failed cells sort last (consistent with the Location column note). Sorting is not currently wired, so this is forward-compatible guidance, not new behavior.

## Lifecycle / progress / cancel (PRD §8)

- On Start: set `stateRun.status` to `running` (after an optional `queued`/`starting` tick), disable **Start**, **Next**, and the **prompt editor** until the run finishes/fails/cancels.
- Progress shows `processed / eligible`, with the summary readout (Eligible / Assigned / No state / Failed / Skipped), reusing the `LocationBar`/`ScrapeBar` status-card layout.
- Sequential loop; per-article `10000ms` timeout via the server abort. A timeout or article-level OpenAI failure records the failure in memory and **continues** to later rows.
- **Cancel:** a Cancel button aborts the in-flight request (client `AbortController`) and stops issuing new calls; mark `cancelled`. Already-assigned rows remain. A cancelled run does not enable Next unless a prior completed run already left valid assignments.
- **Next gating:** disabled while running; enabled on `completed` with ≥1 valid assignment (`assigned` or `no_state`). If every row failed/skipped → stay on the step with a clear failed/empty message. Mixed → allow advancing, keep failed rows visible as `N/A`.

## Ephemerality & reset (PRD §2, §9)

- Store assignments only on the in-memory `article.stateAssignment`; store request/response status, parsed details, validation errors, and per-article failures only in `stateRun` / component state.
- New flow, `resetFlow`, `setArticles` (new search), and page refresh clear all assignments, `stateRun`, and the prompt draft (the draft naturally resets to default). Never persist the edited prompt, final per-article prompts, raw/parsed responses, reasoning, state names, or errors.
- Do **not** query or write `Articles`, `ArticleContents02`, `ArticleStateContract02`, `Prompts`, `States`, `ArtificialIntelligences`, etc.

## Environment variables

| Var | Use |
|-----|-----|
| `KEY_OPEN_AI` | OpenAI API key, read **server-side only** in the assign route. Never logged or returned. |

`PATH_TO_STATE_ASSIGNER_FILES` from the source is **not** needed (prompt is embedded). No other new env vars.

## Testing & verification strategy

- **Unit (vitest, existing patterns):**
  - `defaultPrompt` retains both placeholders and matches the PRD text.
  - `prompt.buildPrompt`: substitutes both placeholders; no-op when a placeholder is removed; empty-string title/content substitution.
  - `parse`: missing content → failed; malformed JSON → failed; fenced JSON tolerated; missing required fields → failed; `false` → `no_state` (not failed); `true`+full name → assigned; `true`+abbreviation → normalized; `true`+blank/unknown → `no_state` with `rawStateText`.
  - `usStates`: name match, abbreviation match, name-before-abbreviation order, unknown → empty.
  - eligibility/content selection: scraped-success vs description fallback; skip when no title+text; rerun skips already-assigned, retries failed.
- **Route (mock `fetch`/OpenAI; no real key, no network):** valid completion → normalized assignment; missing `KEY_OPEN_AI` → error envelope; abort/timeout → 200 `failed`; OpenAI non-2xx → 200 `failed`; asserts no secret/body logging.
- **Component:** `StateBar` gating (disabled until ≥1 article; disabled + Cancel while running); `StatePromptEditor` seeds default, disabled during run; `StateCell` rendering for each `resultStatus`; `FlowIndicatorBar` `canAdvance` for `state`.
- **Reducer:** `setStateRun`, `applyStateAssignments` merge-by-id, `setArticles`/`resetFlow` clear `stateRun` + draft.
- **Smoke:** `page.test.tsx` / existing smoke still pass.
- **Phase gate:** type-check, lint, tests, build per `PLAN_AND_VET.md`. Manual check: enter State stage, edit prompt, run with a small set, confirm progress, cell values, Next gating, and that refresh/reset restores the default prompt.

## Risks / open questions

- **Orchestration choice.** Client-orchestrated per-article calls is the recommended V01 approach (short requests, free progress/cancel). If the assessor prefers a single streaming server route, that is a structural change to revisit before TODO.
- **JSON robustness.** The prompt forces JSON-only, but models occasionally wrap output in code fences. Plan tolerates a fenced-block strip before `JSON.parse`; anything still unparseable is an article-level `failed`. Confirm this minimal tolerance is acceptable vs strict parity.
- **U.S. state list canonicality.** The normalization list should cover the 50 states (+ DC, and likely territories) to match the source `States` table; the exact membership and abbreviation set should be finalized at TODO time. Lite must hardcode it (no DB lookup).
- **Edited-prompt sharing.** `statePromptDraft` on `FlowState` vs a dedicated `StateStageProvider` — both in-memory; pick one at TODO time.
- **`StateAssignment` redefinition.** Expanding the reserved type touches `StateCell` and `types.ts`; verify no other consumer relies on the old `confidence` field (current grep shows only `StateCell` + types).
- **Per-article latency.** Sequential 10s-timeout calls over a large set could be slow, but the working set is bounded by the Search limit; no batching/parallelism is added (one user at a time).

## Out of scope

- Nexus Semantic Rating (stage 6) and any semantic field changes.
- worker-node changes, the source `/state-assigner/start-job` worker route, the API automation proxy, article-targeting/selection fields, ArticleContents02 enrichment, and any DB/file/queue persistence.
- New worker job/poll/cancel routes (this stage uses a plain portal route, not the job registry).
- Saving/draft-persisting the edited prompt beyond current in-memory run state.
