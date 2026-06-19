---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Semantic Rating — TODO V01

Implementation checklist for the approved plan
`docs/20260619_semantic_rating_plan_v02.md` (stage 6 of 6, final stage — PRD §5
"Nexus Semantic Rating", `docs/NewsNexus12LiteV02_prd.md` lines 904–1135).

This is a task list, not a design doc. Read the V02 plan and PRD §5 before starting,
then work the phases in order. Each phase ends with a verification gate and a commit.
Do not start a later phase until the previous phase's gate passes and is committed.

## Ground rules (apply to every phase — do not violate)

- [ ] **Lite isolation.** No runtime imports, HTTP calls, or DB usage from full
      NewsNexus12. Do **not** implement the source DB selection, AI-entity/contract
      resolution, cursor/article-id targeting, the API automation proxy, or
      `get-unscored-articles`. Lite scores the current in-memory working set only.
- [ ] **No durable persistence.** No DB, file, `localStorage`, browser storage, queue
      records, or status files (`isRunningStatus.txt`, `lastRunCompleted.txt`). The
      **only** permitted permanent asset is the checked-in default keyword list.
- [ ] **Fixed exact model, no override.** Model id is the hardcoded constant
      `SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2"` (task `feature-extraction`).
      Do **not** add `SEMANTIC_SCORER_MODEL` / `SEMANTIC_SCORER_DTYPE` env vars, do
      **not** add any model/dtype parameter to a config helper, and do **not** copy the
      location `loadLocationScorerConfig` model-from-env pattern. dtype uses the
      `@huggingface/transformers` library default. This stage adds **no new worker-node
      env vars at all**.
- [ ] **No new packages.** Use the existing `@huggingface/transformers` dependency. Do
      **not** add an xlsx parser or any other dependency.
- [ ] **Reuse the generic job contract.** Use the existing `createJob` / `markRunning` /
      `updateProgress` / `setResults` / `complete` / `fail` registry and the generic
      `GET /jobs/:jobId` + `POST /jobs/:jobId/cancel` routes. Do **not** fork the
      contract or add new poll/cancel routes.
- [ ] **Do not touch unrelated files.** Do **not** modify `package-lock.json` (portal or
      worker-node), `.env`/env files, services, or any existing plan/assessment/TODO
      docs. Do **not** read or print secret/env values. Only add a dependency or change a
      lockfile if an actual implementation task requires it — and none of these tasks
      should. If a lockfile changes unexpectedly, stop and revert it before committing.
- [ ] **Do not restructure the table or other stages.** Render only the existing
      `Nexus Semantic Rating` cell; do not reorder columns or alter Search/Scrape/
      Location/State fields or display.
- [ ] **Logging per AGENTS.md.** worker-node uses the Winston logger; portal server code
      uses `serverLogger`. Never log article content, embeddings, full payloads, or
      secrets — log identifiers, counts, statuses, and failure types only. Use the
      shared error envelope helper for all route errors.

---

## Phase 1 — worker-node pure helpers, types, and default-keyword parity

Build the leaf modules under `worker-node/src/modules/semantic-scorer/` mirroring the
`location-scorer/` layout. These are pure/unit-testable and carry no model parameter.

- [ ] Create `semantic-scorer/types.ts` with the fixed model constant and in-memory
      shapes: `export const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2";`,
      `SemanticArticleInput`, `SemanticScore` (`article_id`, `keyword`, `keywordRating`),
      `SemanticResults` (`scores`, `skippedIds`), and `SemanticSummary`
      (`eligible`, `processed`, `skipped`, `failed`, `modelLoading`). Add a
      `createEmptySemanticSummary()` helper (analog of `createEmptyLocationSummary`).
- [ ] Create `semantic-scorer/config.ts` **with no model/dtype parameter** — it must not
      accept or read a model id from env. (If no non-model config is needed, keep it
      minimal or omit it and note why; the embedder factory references `SEMANTIC_MODEL`
      directly.)
- [ ] Create `semantic-scorer/cosine.ts` exporting a pure `cosineSimilarity(a, b)`
      (dot over magnitude product; guard zero magnitude → 0).
- [ ] Create `semantic-scorer/articleText.ts` exporting `pickArticleText(article)` with
      precedence: successful scraped content (`scrape.status === "success"` and non-blank
      trimmed `scrape.content`) → `description` → `title`; trim; return null/empty
      sentinel when nothing usable remains (caller skips that row). Do **not** reuse the
      location `buildClassifierInput`.
- [ ] Establish the default keyword list as the single source of truth. Add the 25
      keywords verbatim (order preserved, per plan §"Default keywords") as a checked-in
      constant in `portal/src/lib/semantic-scorer/defaultKeywords.ts` (see Phase 4), and
      give worker-node tests access to the same ordered list via a small parity
      constant/import path if needed. Document in the asset's comment the source-workbook
      derivation (first worksheet `Keywords`, skip header row, column A only, trim,
      ignore blanks) — for reference only; do not read the xlsx at runtime.
- [ ] Add unit tests (vitest) alongside each helper:
  - [ ] `cosine.test.ts`: identical → 1; orthogonal → 0; zero-magnitude guard; negative.
  - [ ] `articleText.test.ts`: scraped-success > description > title precedence; trim;
        skip when all blank.
  - [ ] `types`/keyword parity test: default list has the expected count/order.

**Phase 1 gate:**
- [ ] Run worker-node type-check and lint.
- [ ] Run worker-node tests; fix code until green (preserve functionality).
- [ ] Run worker-node build.
- [ ] Check off completed tasks, confirm no unrelated/lockfile/env changes are staged,
      and commit per AGENTS.md (reference this file + Phase 1).

---

## Phase 2 — worker-node embedder + worker thread with recycle-on-timeout

Mirror the stage-4 thread seam (`embedder.ts`, `embedder.worker.ts` +
`.worker.types.ts`, `threadEmbedder.ts`), adding the new `recycle` capability the plan
requires for the per-article timeout.

- [ ] Create `semantic-scorer/embedder.ts`: lazily build and reuse a
      `pipeline("feature-extraction", SEMANTIC_MODEL)` embedder; embed with
      `{ pooling: "mean", normalize: true }`; use the library-default dtype. No model
      parameter is exposed anywhere.
- [ ] Create `semantic-scorer/embedder.worker.ts` + `embedder.worker.types.ts`: the
      worker-thread side that owns one embedder, handles `load` and `embed` messages, and
      correlates responses by per-request id (analog of `classifier.worker.ts`).
- [ ] Create `semantic-scorer/threadEmbedder.ts` exposing the main-thread surface:
  - [ ] `load(): Promise<void>` — lazily spawn the worker and load the fixed model.
  - [ ] `embed(text): Promise<number[]>` — feature-extraction of one text, tracked by id
        in a `pendingEmbeds` deferred map.
  - [ ] `recycle(reason): void` — **new.** `worker.terminate()`, reject + clear every
        entry in `pendingEmbeds` (and any in-flight `load`) with a recoverable error, and
        null `worker`/`loadPromise` so the next `load()`/`embed()` lazily spawns a fresh
        worker and reloads the model. Extend (do not duplicate) the existing `failWorker`
        cleanup; the `error`/`exit` handlers must continue to converge on the same
        cleanup so a crashed worker also respawns.
- [ ] Define the injectable embedder interface (analog of `LocationClassifier`) so the
      router can default to a thread-backed embedder but accept an injected stub in tests.
- [ ] Add `threadEmbedder.test.ts` with a stubbed worker/port (like
      `threadClassifier.test.ts`): load/embed message correlation; and the `recycle`
      protocol — terminate called, pending deferreds rejected and cleared, lazy respawn on
      next `load`/`embed`, and `recycle` is safe to call when idle/aborted.

**Phase 2 gate:**
- [ ] worker-node type-check + lint.
- [ ] worker-node tests green (fix code, not tests, to preserve behavior).
- [ ] worker-node build.
- [ ] Verify no lockfile/env changes; commit per AGENTS.md (reference Phase 2).

---

## Phase 3 — worker-node processor, route, and app mount

Wire the scoring pipeline and integration so the job runs end-to-end in worker-node.

- [ ] Create `semantic-scorer/processor.ts` (`runSemanticJob({ job, articles, keywords,
      embedder })`) implementing the sequential pipeline from plan §"Scoring pipeline":
  - [ ] **load step:** collect eligible rows = produces usable text via `pickArticleText`
        **and** not already carrying an in-memory rating (rerun skip). Count eligible vs
        skipped; `updateProgress(job, 0, summary)`.
  - [ ] **embed keywords once:** set `summary.modelLoading = 1`, `await embedder.load()`,
        embed **each keyword vector once** up front, cache them **on the main thread** for
        the run, then `modelLoading = 0`. If a keyword embed times out/hangs, apply the
        recycle-then-retry-once approach; if keyword vectors still cannot be produced,
        **fail the run** (scoring is impossible without them).
  - [ ] **score step (per article, sequential):** embed article text; compute cosine vs
        every cached keyword vector; pick the single highest. Negative best score or no
        selectable keyword → no semantic score (skip-with-status, rating unset). On
        success append `{ article_id, keyword, keywordRating }` and `updateProgress`.
  - [ ] **per-article timeout + recycle (PRD §5.9):** race the embed against a `10000ms`
        timer. On timeout: record the row in `summary.failed`, call
        `embedder.recycle("article_timeout")`, set `modelLoading = 1`, `await
        embedder.load()` (fresh worker + reloaded model), `modelLoading = 0`, then
        **continue** to later rows. The keyword cache (main thread) is **not** re-embedded
        after a recycle. Do not retry the timed-out row; the recycle path is idempotent
        and bounded by article count.
  - [ ] **article-level (non-timeout) error:** record in `summary.failed` and continue;
        no recycle required (worker not stuck).
  - [ ] **abort/cancel:** honor `job.abortController.signal` **between** articles; skip a
        pending recycle/reload if already aborted.
  - [ ] **incremental results (PRD §5.10):** call `setResults(job, { scores, skippedIds })`
        after each successful article (or small batch) so the latest poll — terminal or
        cancelled — always carries completed scores. This is a deliberate, documented
        divergence from the location all-or-nothing write.
  - [ ] **completion:** ≥1 valid rating → `complete`; model fails to load (initial or
        post-recycle) → `fail` (preserve already-applied per-row successes).
- [ ] Create `semantic-scorer/routes.ts` exporting `createSemanticScorerRouter({
      embedder? })`:
  - [ ] `POST /semantic-scorer/start-job` body `{ articles: SemanticArticleInput[],
        keywords: string[] }`. Validate `articles` is an array of objects each with a
        non-empty string `id` (reuse the location route's shape-check pattern). Validate
        `keywords` is an array; trim + drop blanks server-side; if the resulting list is
        empty → `VALIDATION_ERROR` 400 (defense-in-depth; portal also guards).
  - [ ] Create a `semantic-scorer` job via `createJob<SemanticResults>(...)` seeded with
        `createEmptySemanticSummary()`, respond `202` with `{ jobId, status,
        endpointName }` (identical shape to the location route), kick the processor via
        `setImmediate`. Use the shared error envelope helper; log id/counts only.
  - [ ] Default to a thread-backed embedder when none is injected (injectable seam for
        tests, exactly like `createLocationScorerRouter`).
- [ ] Mount the router in `worker-node/src/app.ts` next to `createLocationScorerRouter`,
      threading an optional `semanticEmbedder` through `CreateAppOptions`.
- [ ] Tests:
  - [ ] `processor.test.ts` (mock embedder — no real model download): best-keyword
        selection (highest cosine wins; negative best → no score); embed-keywords-once
        (assert keyword embedding count == keyword count, not × articles); keyword cache
        survives a recycle (no re-embed of keywords after a timeout); rerun skips
        already-scored rows; blank-text rows skipped; per-article timeout → row failed +
        worker recycled (terminate + pending rejected) + fresh worker reloaded + loop
        continues; non-timeout article error → continue; abort between rows stops new
        work; **fixed model** — embedder factory/config exposes no model parameter and
        ignores any `SEMANTIC_SCORER_MODEL`/`SEMANTIC_SCORER_DTYPE` env values (assert
        model used is always `SEMANTIC_MODEL`).
  - [ ] `routes.test.ts`: `start-job` validates `articles` + `keywords` (empty keywords →
        400); creates a `semantic-scorer` job; status envelope carries `summary` +
        `modelLoading`; generic poll/cancel still work; results keyed by `id`.
  - [ ] One **optional, guarded/skippable** integration test that loads the real model and
        scores a tiny set (must not run in CI by default).

**Phase 3 gate:**
- [ ] worker-node type-check + lint.
- [ ] worker-node tests green (skippable real-model test stays skipped).
- [ ] worker-node build.
- [ ] Verify no lockfile/env changes; commit per AGENTS.md (reference Phase 3).

---

## Phase 4 — portal lib client, state types, and reducer

- [ ] Create `portal/src/lib/semantic-scorer/defaultKeywords.ts` exporting the ordered 25
      default keywords (single source of truth; this is the only permanent config this
      stage adds, survives restarts). Add the source-derivation comment (see Phase 1).
- [ ] Create `portal/src/lib/worker/semanticClient.ts`: `SemanticResults` type and
      `startSemanticJob(articles, keywords)` over the generic `startJob("semantic-scorer",
      { articles, keywords })` (analog of `locationClient.ts`). Define
      `SemanticJob = WorkerJob<SemanticResults, SemanticRunSummary>`.
- [ ] Add the API proxy route `portal/src/app/api/worker/semantic-scorer/start-job/route.ts`
      using `proxyWorkerRequest("/semantic-scorer/start-job", …)` (mirror the location
      start-job proxy). Reuse the existing generic `jobs/[jobId]` + cancel proxy routes —
      do **not** add new poll/cancel proxies.
- [ ] Extend `portal/src/state/types.ts`:
  - [ ] `Article` additions (PRD §5.7): `semanticRatingMax?: number | null`,
        `semanticRatingMaxLabel?: string`, `semanticRatingStatus?: "scored" | "skipped" |
        "failed"`, `semanticRatingError?: string`.
  - [ ] `SemanticRunSummary` (`eligible`, `processed`, `skipped`, `failed`,
        `modelLoading`) and `SemanticRunStatus` (`status: "idle" | "running" |
        "completed" | "failed" | "cancelled"`, `processed`, `total`, `summary`,
        `keywordsUsed?: string[]`).
  - [ ] `FlowState` additions: `semanticRun?: SemanticRunStatus`,
        `semanticKeywordDraft?: string`.
- [ ] **Column-accessor reconciliation:** store the canonical value in
      `semanticRatingMax`, and remove/deprecate the unused `semanticRating` placeholder
      (`Article.semanticRating` in `types.ts` + the `semanticRating` accessor in
      `columns.tsx` are the only references — handled in Phase 5). Pick one approach
      (rename vs alias) and apply consistently; the displayed number is the best cosine
      score either way.
- [ ] Extend `portal/src/state/flowReducer.ts` with action creators + reducer handling:
  - [ ] `setSemanticRun(semanticRun)`.
  - [ ] `applySemanticRatings(scores, skippedIds)` — merge-by-id like
        `applyLocationRatings`: scored ids get `semanticRatingMax` / `…MaxLabel` /
        `status: "scored"`; `skippedIds` get `semanticRatingMax: null` / `status:
        "skipped"`.
  - [ ] `setSemanticKeywordDraft(draft)`.
  - [ ] Clear `semanticRun`, `semanticKeywordDraft`, and the semantic `Article` fields on
        `setArticles` (new search) and `resetFlow` (so the draft falls back to the default
        list — exactly like `statePromptDraft`).
- [ ] Tests: `semanticClient` start-job call shape; reducer tests for `applySemanticRatings`
      merge-by-id, `setSemanticRun`, `setSemanticKeywordDraft`, and draft/field clearing on
      `setArticles`/`resetFlow`; semantic proxy route test (mirror location route test).

**Phase 4 gate:**
- [ ] portal type-check + lint.
- [ ] portal tests green.
- [ ] portal build.
- [ ] Verify no lockfile/env changes; commit per AGENTS.md (reference Phase 4).

---

## Phase 5 — portal UI integration (action area, keyword editor, table cell, Finish gating)

- [ ] Create `portal/src/components/semantic/SemanticBar.tsx` (analog of `LocationBar`):
      **Start Rating** button (PRD step 5), progress label (`processed / eligible`),
      summary readout (Eligible / Scored / Skipped / Failed) reusing the `LocationBar`
      status-card layout, a distinct **"Loading model…"** label when
      `summary.modelLoading === 1` (note it can re-appear mid-run after a timeout
      recycle), Cancel button while running, and warnings/errors. Disabled until the
      working set has ≥1 article, while running, and when the trimmed keyword list is
      empty.
  - [ ] Run orchestration (reuse `LocationBar.handleRate` shape): snapshot the trimmed
        keyword list into `semanticRun.keywordsUsed`; `dispatch(setSemanticRun({status:
        "running", …}))`; `startSemanticJob(articles, keywords)` → `pollJob<
        SemanticResults, SemanticRunSummary>(jobId, { onUpdate })` dispatching
        `setSemanticRun(toSemanticRunStatus(job))`; on terminal, apply
        `terminalJob.results` for **`completed` and `cancelled`** via
        `applySemanticRatings(results.scores, results.skippedIds)`.
  - [ ] **Empty-keyword guard:** if the trimmed keyword list is empty, do not call the
        job — show "at least one keyword is required" warning (PRD §5.4/§5.10).
- [ ] Add a `"semantic"` branch to `portal/src/components/search/StageActionArea.tsx`
      returning `<SemanticBar />`.
- [ ] Add `SemanticKeywordEditorSlot` (pattern of `StatePromptEditorSlot`): render
      `null` unless `currentStage === "semantic"`; a multiline `<textarea>` (one keyword
      per line) seeded from `defaultKeywords` and bound to `semanticKeywordDraft`;
      disabled while the run is active (`running`). Place it after `<ArticlesTable />` in
      `portal/src/app/page.tsx`, next to the existing `<StatePromptEditorSlot />`.
- [ ] Update `portal/src/components/tables/columns.tsx` semantic cell to read
      `semanticRatingMax` (per the reconciliation in Phase 4) and mirror the location
      cell logic: `undefined` → empty cell; number → `RatingCircle`; `null` (skipped/
      failed) → `N/A`. **No `RatingCircle` change** is needed. Remove the unused
      `semanticRating` placeholder accessor/field per the chosen reconciliation.
- [ ] Update `portal/src/components/layout/FlowIndicatorBar.tsx`: add a `semantic` clause
      to `canAdvance` (true when `semanticRun?.status === "completed"` and ≥1 valid score).
      Semantic is terminal (`getNextStage("semantic")` is `undefined`), so the existing
      Next button is already disabled there. Decide and implement the terminal affordance:
      **recommended** — relabel the action to **"Finish"** on the last stage (presentational
      `FlowIndicator` tweak only). Completion rules (PRD §5.9): ≥1 valid rating → completed
      (Finish enabled); every row failed/skipped → stay on step with a clear failed/empty
      message; mixed → allow finishing, keep failed/skipped rows visible as `N/A`.
- [ ] **Optional** (PRD §5.8): a `SemanticModal` (pattern of `ScrapeModal`) showing best
      keyword + current-run status/error, in-memory only. Skip if time-constrained.
- [ ] Tests: `SemanticBar` gating (disabled until ≥1 article, empty-keyword warning,
      disabled + Cancel while running, model-loading label, cancel preserves completed
      scores); `SemanticKeywordEditor` seeds default + disabled during run + resets to
      default on new flow/reset; semantic cell rendering for empty / score / `N/A`;
      `FlowIndicatorBar`/Finish gating for `semantic`; `page.test.tsx` smoke still passes.

**Phase 5 gate:**
- [ ] portal type-check + lint.
- [ ] portal tests green.
- [ ] portal build.
- [ ] Verify no lockfile/env changes; commit per AGENTS.md (reference Phase 5).

---

## Phase 6 — full verification and manual smoke

- [ ] Run worker-node and portal type-check, lint, full test suites, and builds together;
      fix any cross-package issues (preserve functionality — fix code, not tests).
- [ ] Confirm the optional real-model integration test remains guarded/skippable and that
      CI does not download the model.
- [ ] Manual smoke (per plan §"Testing & verification"): enter the Semantic stage; view
      the default keywords; edit them; Start Rating on a small set; confirm progress +
      model-loading state, circle percentages, `N/A` for skipped, Finish gating, that
      cancel preserves completed scores, and that refresh/reset restores the default
      keyword list. If feasible, exercise a slow/stuck article (e.g. an oversized text) to
      confirm the run recovers and continues after the recycle; capture rough
      recycle+reload timing as a note.
- [ ] Final review: confirm no durable persistence was added, no full-NewsNexus12 runtime
      dependency was introduced, no model/dtype override exists, and no
      lockfile/env/unrelated files were modified.
- [ ] Commit any remaining verification fixes per AGENTS.md (reference Phase 6). This is
      the final stage — there is no stage 7; do not pre-build anything beyond §5.
