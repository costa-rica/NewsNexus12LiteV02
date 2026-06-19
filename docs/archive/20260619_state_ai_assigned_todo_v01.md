---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# State (AI Assigned) — TODO V01

Implementation task list for **§4 "State (AI Assigned)" Section** of
`docs/NewsNexus12LiteV02_prd.md` (lines 641–901), derived from
`docs/20260619_state_ai_assigned_plan_v01.md`. This is **stage 5 of 6** in
`docs/20260615_build_sequence.md` (Foundation → Search → Scrape → Location →
**State** → Semantic).

> **Do not begin implementation until this TODO has been assessed and accepted**
> per `docs/PLAN_AND_VET.md`. This file is implementation guidance only — writing
> code now is out of process.

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
    StateResultStatus`, `errorMessage?: string`.
  - Add `StateRunSummary` (`eligible`, `processed`, `assigned`, `noState`,
    `failed`, `skipped`) and `StateRunStatus` (`status: "idle" | "queued" |
    "running" | "completed" | "failed" | "cancelled"`, `processed`, `total`,
    `summary`, `promptUsed?: string`).
  - Add `stateRun?: StateRunStatus` and `statePromptDraft?: string` to
    `FlowState`.
- [ ] Confirm no other consumer relies on the removed `confidence` field
      (grep; expected only `StateCell` + types). Update any that surface.
- [ ] In `portal/src/state/flowReducer.ts`, add actions + handlers mirroring the
      Location pattern:
  - `setStateRun(stateRun)` — set `state.stateRun`.
  - `applyStateAssignments(assignments)` — merge per-article by id (same
    merge-by-id shape as `applyLocationRatings` / `applyScrapeResults`),
    writing each result to `article.stateAssignment`.
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
      OpenAI completion into `StateAssignment`, no network/env:
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
    invalid body → `VALIDATION_ERROR` (400). Never read/log the key value.
  - **Per-article handling:** `buildPrompt` → call
    `https://api.openai.com/v1/chat/completions` with the **exact source request
    shape** (PRD `§4.4`): `model: "gpt-4o-mini"`, single `user` message =
    substituted prompt, `temperature: 0.3`, **no** system message, **no**
    `response_format`. Apply a `10000ms` `AbortController` timeout (PRD `§8`).
  - Parse via `parse.ts`. **Article-level problems** (missing content, malformed
    JSON, missing required fields, abort/timeout, OpenAI non-2xx) return **HTTP
    200 with a `StateAssignment` whose `resultStatus: "failed"`** and a
    sanitized `errorMessage`, so the client records the failure and continues.
    Only config/validation problems use the error envelope.
  - Logging via `serverLogger`: identifiers/counts/statuses/failure types only;
    **never** the prompt, content, request body, or raw response.
- [ ] `portal/src/lib/state-assigner/client.ts` — thin browser client
      `assignArticleState({ promptTemplate, title, content }, signal)` →
      `POST /api/state-assigner/assign`, returning a `StateAssignment`. Accept an
      `AbortSignal` for cancel. Throw a typed error (mirror the
      `WorkerRequestError` pattern in `jobClient.ts`) for config/validation
      envelope responses so the orchestrator can treat them as **run-level**
      failures.
- [ ] Route tests (mock `fetch`/OpenAI; **no real key, no network**): valid
      completion → normalized assignment; missing `KEY_OPEN_AI` → error envelope;
      abort/timeout → 200 `failed`; OpenAI non-2xx → 200 `failed`; assert no
      secret/body logging (spy the logger).
- [ ] **Verification gate:** lint, typecheck, route tests pass.

## Phase 4 — UI: action bar, prompt editor, table cell

- [ ] `portal/src/components/state/StateBar.tsx` — action region for the State
      stage (analog of `LocationBar`). Owns the **client-orchestrated sequential
      loop**:
  - **Start Assigning States** button, disabled until the working set has ≥1
    article and while a run is active; **Cancel** button while running.
  - Compute eligible rows (PRD `§5`): content precedence = successful scrape
    content (`article.scrape.content` with `scrape.status === "success"`) else
    `article.description`; title from the RSS article. Skip rows with neither
    non-empty title nor usable content (trimmed) → `skipped`. On rerun within
    the same flow, skip rows already holding a completed assignment
    (`assigned`/`no_state`); retry `failed`/`skipped`.
  - On Start: snapshot the current prompt draft into `stateRun.promptUsed`; set
    status `running` (optional `queued`/`starting` tick); loop eligible rows
    **sequentially** calling `assignArticleState` with a per-call
    `AbortController` (10s server timeout backs it). Dispatch progress
    (`setStateRun`) and merge each result (`applyStateAssignments`) as it
    returns. Article-level failures/timeouts record the failure and **continue**.
  - **Cancel:** abort the in-flight request and stop issuing new calls; mark
    `cancelled`. Already-assigned rows remain.
  - Run-level config error (typed client error) → stop loop, mark `failed`,
    show message.
  - Progress label + summary readout (Eligible / Assigned / No state / Failed /
    Skipped) reusing the `LocationBar`/`ScrapeBar` status-card layout.
- [ ] `portal/src/components/state/StatePromptEditor.tsx` — editable `<textarea>`
      rendered **below** the table. Seeded from `statePromptDraft` and falling
      back to `defaultPrompt` when the draft is unset; edits dispatch
      `setStatePromptDraft`. **Disabled while a run is active** (PRD `§3`).
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
      to `canAdvance`: enabled when `state.stateRun?.status === "completed"` and
      ≥1 **valid** assignment (`assigned` or `no_state`, i.e. summary
      `assigned + noState > 0`). Disabled while running; if every row
      failed/skipped → stay on step (Next stays disabled), surface the clear
      failed/empty message in `StateBar`. Mixed results → allow advancing, keep
      failed rows visible as `N/A`.
- [ ] Reducer tests (`flowReducer.test.ts`): `setStateRun`;
      `applyStateAssignments` merge-by-id; `setStatePromptDraft`/clear;
      `setArticles` and `resetFlow` clear `stateRun` + `statePromptDraft`.
- [ ] Component tests: `StateBar` gating (disabled until ≥1 article; Cancel +
      disabled Start while running); `StatePromptEditor` seeds default and is
      disabled during a run; `StateCell` rendering for each `resultStatus`;
      `FlowIndicatorBar` `canAdvance` for `state`.
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
  assignment; blocked when all fail/skip).
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
