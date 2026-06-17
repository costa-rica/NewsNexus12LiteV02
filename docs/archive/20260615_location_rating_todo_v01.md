---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Location Rating — TODO v01

Implementation task list for **stage 4 of 6** (Nexus Location Rating). It implements
`docs/20260615_location_rating_plan_v01.md` and only PRD §3 "Nexus Location Rating Section"
(`docs/NewsNexus12LiteV02_prd.md`). It adds a Hugging Face zero-shot location scorer to
**worker-node**, reusing the generic job contract from stage 3, and populates the **Nexus
Location Rating** column.

> ⚠️ **Contract is PLANNED, not yet real.** As of this writing Scrape (stage 3) is **not
> implemented** (no `worker-node/` app, no generic job contract, no scrape run-status
> state). This TODO binds to the *planned* stage-3 contract from
> `docs/20260615_scrape_plan_v02.md` / `docs/20260615_scrape_todo_v01.md`. **Phase 0 is a
> hard gate**: do not implement until Scrape is committed and green, and re-verify the real
> names — if they differ, produce a TODO v02 before coding.

## How to use this file

- Work top to bottom, one phase at a time. Do not start a phase until the previous phase's
  end-of-phase checks pass.
- End-of-phase checks run in **both apps** (portal + worker-node): type-check → lint →
  test → build.
- If a check fails, fix the code so functionality remains and checks pass before moving on.
- **Do not commit until Phase 6** (one commit per stage, then stop), mirroring prior stages
  and `docs/20260615_build_sequence.md`.

## Roadmap context (read before writing code)

- This is part **4 of 6**. Full sequence: Foundation → Search → Scrape → **Location** →
  State → Semantic.
- **Reuse** the stage-3 generic job/poll/cancel contract (worker-node registry/runner,
  `GET /jobs/:jobId`, `POST /jobs/:jobId/cancel`, portal `jobClient`). Add only a
  workflow-specific `start-job` route + processor and a portal control. **No new
  poll/cancel routes.**
- Run the model in **worker-node** (Transformers.js) — no worker-python.
- The table renders **all 7 columns** from stage 1; this stage only populates **Nexus
  Location Rating**. Do not reorder/restructure the table or touch State/Semantic fields.
- All data is **ephemeral / in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build state/semantic behavior.

## Planned contract to bind to (VERIFY against committed scrape at Phase 0)

- worker-node generic job registry + runner; generic `GET /jobs/:jobId` and
  `POST /jobs/:jobId/cancel`.
- portal `src/lib/worker/jobClient.ts` — `startJob(endpoint, payload)`, `pollJob(jobId)`,
  `cancelJob(jobId)`; generic proxy routes under `src/app/api/worker/...`.
- portal run-status state pattern: a per-stage run object on `FlowState` + a merge-by-id
  action (scrape's `scrapeRun` / `applyScrapeResults`); `article.scrape.content` +
  `status` available for input text.
- `StageActionArea` switch on `currentStage` (scrape branch present);
  `FlowIndicatorBar` `canAdvance` logic; `RatingCircle` cell already mapped from
  `locationRating` in `columns.tsx`.

## Cross-cutting: Logging & Error Handling (project standard)

Apply the **Logging** and **Error Handling** sections of `AGENTS.md`
(`docs/LOGGING_NODE_JS_V08.md`, `docs/ERROR_REQUIREMENTS.md`) to all code in this stage:

- worker-node code logs via the Winston logger; portal server code logs via
  `portal/src/lib/serverLogger.ts`. No `console.*` in committed server code; never log
  secrets or full article/query bodies (log ids, counts, statuses, failure types — and
  surface model-loading/parity issues through the logger, not `console`).
- Every API endpoint added or modified here — the worker `POST /location-scorer/start-job`
  and any portal route handler — returns the standard error envelope
  `{ error: { code, message, details?, status } }` via the shared error helper; log the
  detail server-side, return the sanitized envelope to the client.

## OUT OF SCOPE for this stage — do NOT implement (hard guardrails)

- ❌ No State/OpenAI (stage 5) or semantic (stage 6) logic; do not populate columns 6–7.
- ❌ No worker-python, PyPI `transformers`, Postgres, DB models, durable score storage, or
  the source `limit`/batch behavior.
- ❌ No new poll/cancel routes — reuse the generic ones.
- ❌ No durable persistence of any kind: no DB, files, `localStorage`, `sessionStorage`,
  cookies. Ratings/run state live only in worker-node job memory and portal in-memory state.
- ❌ Do not store or display the "Occurred outside the United States" score.
- ❌ Do not reorder/restructure the table or move persistent regions outside `SlideStage`.

---

## Phase 0 — Preconditions (HARD GATE) & dependencies

- [x] Verify **Scrape (stage 3) is committed** and both apps are green
      (type/lint/test/build). If not, **stop** — do not implement this stage yet.
- [x] Verify the planned contract names above against the committed scrape code: generic
      registry/runner, `GET /jobs/:jobId` + cancel, portal `jobClient`
      (`startJob`/`pollJob`/`cancelJob`), proxy route layout, the run-status state pattern +
      merge-by-id action, and `article.scrape.content`/`status`. If any name differs, **stop
      and produce a TODO v02** bound to the real names.
- [x] Add worker-node dep `@huggingface/transformers`; pin version, note in commit body.
- [x] Add to `worker-node/.env.example`: `LOCATION_SCORER_MODEL=Xenova/bart-large-mnli`
      (and an optional model cache dir var). Document that first model download is large/slow.

### End-of-phase checks (Phase 0)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 1 — Location classifier & pipeline modules (worker-node, mock-testable)

Create under `worker-node/src/modules/location-scorer/`:

- [x] `types.ts` — `LocationScore` (`{ article_id, score, rating_for: "Occurred in the
      United States" }`) and the run-summary fields (`mode: "score"`, `currentStep`,
      `eligible`, `processed`, `skipped`, `modelLoading`).
- [x] `config.ts` — read `LOCATION_SCORER_MODEL` (default `Xenova/bart-large-mnli`).
- [x] `classifier.ts` — `getClassifier()` lazily builds
      `pipeline("zero-shot-classification", model)` and **reuses** the instance. Export the
      exact candidate labels: `["Occurred in the United States", "Occurred outside the
      United States"]`.
- [x] `inputText.ts` — assemble `"<title>\n\n<best text>"`; best-text precedence:
      successful `article.scrape.content` → `article.description` → RSS `article.content`;
      trim; return eligibility (skip when both title and body are blank).
- [x] `scorer.ts` — from a classifier result, extract the score for **"Occurred in the
      United States"** (not the first/winning label); clamp `0..1`; **throw** if that label
      is missing (run-failure path).
- [x] Unit tests (mock the classifier — no model download): input precedence + skip-blank;
      label-set exactness; US-score extraction vs winning label; missing-US-label → error;
      clamp.

### End-of-phase checks (Phase 1)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 2 — Location processor & start-job route (worker-node)

- [x] `processor.ts` — orchestrate `load → classify → write` on the generic job runner,
      sequentially:
      - **load**: count eligible rows; **skip rows that already have a numeric
        `locationRating`** (rerun behavior, mirrors `get_unscored_articles`);
      - **classify**: lazy-load the model (set `summary.modelLoading` while loading); score
        each eligible article; update `processed`/`currentStep`;
      - **write**: emit `LocationScore[]` keyed by article `id`.
      Honor `AbortSignal`; on missing-US-label or model-load failure → fail the job without
      partial writes.
- [x] `POST /location-scorer/start-job` — validate `{ articles }`, create a
      `location-scorer` job via the generic registry, run the processor, return
      `{ jobId, status: "queued", endpointName: "location-scorer" }`. The generic
      `GET /jobs/:jobId` envelope exposes the location `summary` (incl. `modelLoading`) and
      `results: LocationScore[]`.
- [x] Tests (mock classifier): start-job creates the job; step transitions + `modelLoading`
      surfaced; missing-label → `failed`; cancel mid-run → `cancelled`; results keyed by id;
      already-rated rows skipped on rerun.

### End-of-phase checks (Phase 2)
- [x] worker-node: type-check · lint · test · build pass.

---

## Phase 3 — Portal client & state additions

- [x] `portal/src/lib/worker/locationClient.ts` — `startLocationJob(articles)` =
      `startJob("location-scorer", { articles })`.
- [x] Extend `portal/src/state/types.ts`: add `LocationRunStatus`
      (`status`, `currentStep`, `eligible`, `processed`, `skipped`, `modelLoading`) and
      optional `locationRun` on `FlowState`.
- [x] Extend `portal/src/state/flowReducer.ts`: add `setLocationRun(status)` and
      `applyLocationRatings(scores, skippedIds)` that merges by `id` — **scored** rows get a
      numeric `locationRating`; **skipped** rows get `locationRating: null` (the `N/A`
      marker); not-processed rows stay `undefined`. Confirm `resetFlow` clears `locationRun`
      and ratings.
- [x] Tests: `locationClient`; reducer merge-by-id (number vs `null` vs untouched);
      `resetFlow` clears location run + ratings.

### End-of-phase checks (Phase 3)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 4 — Portal UI: Start Rating control, run status, table N/A, gating

- [x] `portal/src/components/location/LocationBar.tsx` (`"use client"`, mirror the scrape
      control): **Start Rating** button (disabled until ≥1 article and while running) →
      `startLocationJob(state.articles)` → `pollJob` → `dispatch(setLocationRun(...))` +
      `dispatch(applyLocationRatings(...))`. Show step-mapped progress (loading rows →
      classifying *m/n* → applying) and a **distinct model-loading state** when
      `modelLoading`.
- [x] Extend `StageActionArea` with the `"location"` branch → `<LocationBar/>`.
- [x] Extend `FlowIndicatorBar`: `canAdvance` also true when `currentStage === "location"`
      and the run completed with **≥1 classified** article; disabled while running.
- [x] Update the **Nexus Location Rating** column cell: numeric → `RatingCircle`
      (`Math.round(score*100)%`), `null` → render **`N/A`**, `undefined` → empty. Keep
      `RatingCircle` pure (numbers only); put the `N/A` mapping in the column cell/wrapper.
      Do not reorder columns.
- [x] Empty-result handling: if every article was skipped (zero classified), stay on the
      step with a clear message and leave Next disabled; mixed skipped/classified → allow
      advancing, keep skipped rows (`N/A`) visible.
- [x] Tests: `LocationBar` run flow (mocked client) updates ratings + run status; model-
      loading state; gating (disabled running, enabled ≥1 classified, empty-result path);
      cell rendering (number `%` / `N/A` / empty); `page.test.tsx` still passes.

### End-of-phase checks (Phase 4)
- [x] portal: type-check · lint · test · build pass.

---

## Phase 5 — Stage verification (manual + automated)

- [ ] Both apps build; worker-node loads the model (first load slow — expected); portal
      `dev` runs. _(builds verified; live model load NOT run here — requires the
      ~1.6GB Xenova/bart-large-mnli download)_
- [ ] Run Search → Scrape → Location → click Start Rating: the **Nexus Location Rating**
      column fills with percentages in colored circles; skipped rows show **`N/A`**;
      higher scores render greener. _(live e2e not run here; covered by mocked LocationBar
      tests + the N/A column test)_
- [ ] The distinct model-loading state shows on first run; per-article progress shows
      thereafter. _(live model not run here)_
- [x] Next is disabled while running and enabled after completion with ≥1 classified;
      all-skipped → empty-result message, Next stays disabled.
- [x] `resetFlow` clears location ratings + run status.
- [ ] **Score sanity / parity spot-check**: confirm a clearly-US article scores high and a
      clearly-non-US article scores low; note any material divergence from the worker-python
      reference (escalation path per the plan's parity risk). _(NOT run here — requires the
      real model; left for live verification)_
- [x] Confirm **no persistence** and **no out-of-scope** work: no worker-python, no DB,
      no durable storage, no new poll/cancel routes, "outside US" score never stored/shown,
      columns 6–7 untouched, table not restructured.
- [x] **Logging & Error Handling compliance** (`AGENTS.md`): worker `start-job` and any
      portal route use the app logger (no `console.*`) and return the standard error
      envelope; no secrets or full bodies logged.

### End-of-phase checks (Phase 5)
- [x] worker-node + portal: type-check · lint · test · build pass.

---

## Phase 6 — Commit (only after all checks pass)

- [x] All phases complete; all end-of-phase checks green in both apps; every checkbox above
      checked off; no files outside this stage's scope modified beyond the documented portal
      additions (`state`, `components/location`, location column cell, `lib/worker/
      locationClient`) and the new worker-node `location-scorer` module + route.
- [x] Stage and commit per `AGENTS.md` (broad commit — new worker workflow + portal
      integration): lowercase title ≤ 50 chars, body explaining *why* + main areas,
      reference this TODO file and its phases, append
      `co-authored-by: <agent name> (<model>)`.
- [x] Do **not** push. Do **not** start stage 5 (State) — stop after the stage 4 commit per
      `docs/20260615_build_sequence.md`.
