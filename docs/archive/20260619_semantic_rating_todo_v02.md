---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Semantic Rating — TODO V02

Implementation checklist for the approved plan
`docs/20260619_semantic_rating_plan_v02.md` (stage 6 of 6, final stage — PRD §5
"Nexus Semantic Rating", `docs/NewsNexus12LiteV02_prd.md` lines 904–1135).

This is a task list, not a design doc. Read the V02 plan and PRD §5 before starting,
then work the phases in order. Each phase ends with a verification gate and a commit.
Do not start a later phase until the previous phase's gate passes and is committed.

## Revision note (changes relative to TODO V01)

This V02 supersedes `docs/20260619_semantic_rating_todo_v01.md` and resolves the three
qualifying concerns in `docs/20260619_semantic_rating_todo_v01_assessment_codex.md`. Only
the flagged areas changed; everything else is carried forward from V01 because it remains
valid.

1. **Terminal-stage Finish contract is now explicit.** V01 called the Finish change a
   "presentational tweak only," but `FlowIndicator` disables on `disabled={!canAdvance ||
   !nextStage}` and `getNextStage("semantic")` is `undefined`, so a label-only change would
   leave Finish permanently disabled even after a successful run. V02 specifies the exact
   terminal contract: on the terminal stage the button reads **Finish**, its disabled state
   is driven by **`canAdvance` only** (not `nextStage`), and clicking it is a **no-op
   completed affordance** (it must **not** call `setStage`, because there is no next stage).
   See **§ Terminal-stage Finish contract** and Phase 5.

2. **Worker result contract now carries failed rows.** V01's `SemanticResults` exposed only
   `{ scores, skippedIds }`, so the reducer had no channel to mark timeout/error rows as
   `semanticRatingStatus: "failed"` / `semanticRatingError`. V02 adds a
   **`failures: { article_id: string; reason: string }[]`** channel to `SemanticResults`,
   threads it through the processor, reducer (`applySemanticRatings`), and tests, with a
   **sanitized** `reason` (failure *type* only — `"timeout"` | `"error"` | `"no_score"` —
   never article content, embeddings, or stack traces). See **§ Result contract for
   scored / skipped / failed rows** and Phases 3–5.

3. **Zero-valid-rating terminal behavior is now defined end to end.** V01 left the terminal
   job status ambiguous when every row was blank/skipped/timed-out/errored/no-score. V02
   requires the processor to **always publish final results** (`scores`, `skippedIds`,
   `failures`) and then mark the job **`failed`** (a clearly handled terminal status) when
   there are **zero valid scores**, while the portal applies those results so rows still
   render `N/A`, shows an empty/failed message, and keeps Finish disabled. Tests cover
   all-skipped, all-failed, and mixed-success runs separately. See **§ Zero-valid-rating
   terminal behavior** and Phases 3 & 5.

---

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

## Reference contracts (read once, applied across phases)

These three subsections define the cross-cutting contracts that resolve the V01
assessment. Each implementation task below references them; keep them consistent across
worker-node and portal.

### Result contract for scored / skipped / failed rows

The single canonical worker result shape for this stage is:

```ts
export interface SemanticResults {
  scores: SemanticScore[];                          // valid ratings (one per scored row)
  skippedIds: string[];                             // ineligible: blank text OR no-text rerun-skip
  failures: { article_id: string; reason: string }[]; // NEW in V02 — per-row failure rows
}
```

- **`scores`** — rows that produced a valid best keyword/score. Reducer sets
  `semanticRatingMax` (number), `semanticRatingMaxLabel`, `semanticRatingStatus: "scored"`.
- **`skippedIds`** — rows with no usable text (or rerun-skipped). Reducer sets
  `semanticRatingMax: null`, `semanticRatingStatus: "skipped"`.
- **`failures`** — rows that were attempted but failed: per-article **timeout**, per-article
  **non-timeout embedding/scoring error**, or **no-valid-score** (negative best / no
  selectable keyword). Reducer sets `semanticRatingMax: null`,
  `semanticRatingStatus: "failed"`, and `semanticRatingError` = the sanitized `reason`.
- **`reason`** is a **sanitized failure type only**, one of `"timeout"` | `"error"` |
  `"no_score"`. It **must not** contain article content, embeddings, message bodies, file
  paths, or stack traces (AGENTS.md). The same set of `failed`-count rows that increment
  `summary.failed` must appear in `failures` so the count and the row list stay in sync.
- A given article id appears in **exactly one** of `scores` / `skippedIds` / `failures`.

### Terminal-stage Finish contract

`FlowIndicator` currently renders one button with
`disabled={!canAdvance || !nextStage}` and an `onClick` that returns early when
`!nextStage`. Semantic is terminal (`getNextStage("semantic") === undefined`), so a
label-only change would leave the button permanently disabled. The terminal contract is:

- **Detect terminal stage** in `FlowIndicator` via `const isTerminal = !nextStage;`.
- **Label:** `isTerminal ? "Finish" : "Next"`.
- **Disabled state:** for the terminal stage use **`!canAdvance`** (do **not** also require
  `nextStage`); non-terminal stages keep the existing `!canAdvance || !nextStage`.
- **Click behavior:** when `isTerminal`, clicking is a **no-op completed affordance** — it
  must **not** dispatch `setStage` (there is no next stage). The enabled+Finish state is
  itself the "flow complete" affordance. Keep it accessible (e.g. an appropriate
  `aria-label`/title such as "Pipeline complete"); an enabled no-op button is acceptable for
  this demo. Do **not** introduce durable "finalized" persistence.
- **`canAdvance` for semantic** (`FlowIndicatorBar`): `true` only when
  `semanticRun?.status === "completed"` **and** there is **≥1 valid score**
  (`semanticRun.summary.processed > 0`). This is consistent with the zero-valid path below,
  which yields status `failed` (so `canAdvance` is naturally `false`), but assert both
  conditions explicitly.

### Zero-valid-rating terminal behavior

When a run yields **zero valid scores** (every eligible row blank/skipped, timed out,
errored, or produced no valid score), the processor must reach a **clearly handled terminal
status** rather than leaving the poller to time out:

- The processor **always publishes final results first** via `setResults(job, { scores,
  skippedIds, failures })` (so skipped/failed rows render even on a non-success terminal),
  **then** marks the job **`failed`** when `scores.length === 0`. (`failed` — not `complete`
  — so the successful Finish path is never enabled with no ratings, and the "stay on the
  step" PRD §5.9 behavior holds without extra portal guards.)
- With **≥1 valid score**, publish results then `complete` the job (success path).
- The portal applies `terminalJob.results` (scores + skippedIds + failures) on **any**
  terminal status that carries results — `completed`, `cancelled`, **and** `failed` — so
  skipped/failed rows always show `N/A`. Finish gating still depends only on `completed` +
  `processed > 0`, so a zero-valid `failed` run keeps Finish disabled and shows the
  empty/failed message.
- A **model-load failure** (initial or post-recycle) also terminates as `failed`; publish
  whatever results exist (already-applied per-row successes are preserved per Incremental
  results). The portal's empty/failed message covers both zero-valid and load-failure cases.

---

## Phase 1 — worker-node pure helpers, types, and default-keyword parity

Build the leaf modules under `worker-node/src/modules/semantic-scorer/` mirroring the
`location-scorer/` layout. These are pure/unit-testable and carry no model parameter.

- [ ] Create `semantic-scorer/types.ts` with the fixed model constant and in-memory
      shapes: `export const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2";`,
      `SemanticArticleInput`, `SemanticScore` (`article_id`, `keyword`, `keywordRating`),
      `SemanticResults` (`scores`, `skippedIds`, **`failures: { article_id: string;
      reason: string }[]`** per **§ Result contract**), and `SemanticSummary`
      (`eligible`, `processed`, `skipped`, `failed`, `modelLoading`). Add a
      `createEmptySemanticSummary()` helper (analog of `createEmptyLocationSummary`) and a
      `createEmptySemanticResults()` helper (`{ scores: [], skippedIds: [], failures: [] }`).
      Define a small `SemanticFailureReason = "timeout" | "error" | "no_score"` union and
      use it for `failures[].reason` so the sanitized failure type is enforced by the type
      system.
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
Honor **§ Result contract** and **§ Zero-valid-rating terminal behavior** throughout.

- [ ] Create `semantic-scorer/processor.ts` (`runSemanticJob({ job, articles, keywords,
      embedder })`) implementing the sequential pipeline from plan §"Scoring pipeline".
      Maintain three running accumulators — `scores: SemanticScore[]`,
      `skippedIds: string[]`, and `failures: { article_id; reason }[]` — alongside
      `summary`:
  - [ ] **load step:** collect eligible rows = produces usable text via `pickArticleText`
        **and** not already carrying an in-memory rating (rerun skip). Push no-text/rerun
        rows to `skippedIds`. Count eligible vs skipped; `updateProgress(job, 0, summary)`.
  - [ ] **embed keywords once:** set `summary.modelLoading = 1`, `await embedder.load()`,
        embed **each keyword vector once** up front, cache them **on the main thread** for
        the run, then `modelLoading = 0`. If a keyword embed times out/hangs, apply the
        recycle-then-retry-once approach; if keyword vectors still cannot be produced,
        publish final results then **fail the run** (scoring is impossible without them) —
        per **§ Zero-valid-rating terminal behavior**.
  - [ ] **score step (per article, sequential):** embed article text; compute cosine vs
        every cached keyword vector; pick the single highest. On success append
        `{ article_id, keyword, keywordRating }` to `scores`, set
        `summary.processed = scores.length`, and `updateProgress`.
  - [ ] **no-valid-score:** negative best score or no selectable keyword → push
        `{ article_id, reason: "no_score" }` to `failures`, increment `summary.failed`,
        leave rating unset, and continue. (This is a **failure** row, not a `skippedId`, so
        the table shows it as a current-run `failed`/`N/A` per **§ Result contract**.)
  - [ ] **per-article timeout + recycle (PRD §5.9):** race the embed against a `10000ms`
        timer. On timeout: push `{ article_id, reason: "timeout" }` to `failures`,
        increment `summary.failed`, call `embedder.recycle("article_timeout")`, set
        `modelLoading = 1`, `await embedder.load()` (fresh worker + reloaded model),
        `modelLoading = 0`, then **continue** to later rows. The keyword cache (main
        thread) is **not** re-embedded after a recycle. Do not retry the timed-out row;
        the recycle path is idempotent and bounded by article count.
  - [ ] **article-level (non-timeout) error:** push `{ article_id, reason: "error" }` to
        `failures`, increment `summary.failed`, and continue; no recycle required (worker
        not stuck).
  - [ ] **abort/cancel:** honor `job.abortController.signal` **between** articles; skip a
        pending recycle/reload if already aborted.
  - [ ] **incremental results (PRD §5.10):** call `setResults(job, { scores, skippedIds,
        failures })` after each successful article (or small batch) so the latest poll —
        terminal or cancelled — always carries completed scores **and** the failed/skipped
        row lists. This is a deliberate, documented divergence from the location
        all-or-nothing write.
  - [ ] **completion (§ Zero-valid-rating terminal behavior):** publish final results
        (`setResults(job, { scores, skippedIds, failures })`) **before** the terminal
        transition, then:
        - `scores.length >= 1` → `complete(job, summary)` (success path).
        - `scores.length === 0` (all blank/skipped/timed-out/errored/no-score) →
          `fail(job, …)` with a sanitized reason (no content). Skipped/failed ids are
          already in the published results so the table can render `N/A`.
        - model fails to load (initial or post-recycle) → publish whatever results exist
          (preserving already-applied per-row successes) then `fail(job, …)`.
- [ ] Create `semantic-scorer/routes.ts` exporting `createSemanticScorerRouter({
      embedder? })`:
  - [ ] `POST /semantic-scorer/start-job` body `{ articles: SemanticArticleInput[],
        keywords: string[] }`. Validate `articles` is an array of objects each with a
        non-empty string `id` (reuse the location route's shape-check pattern). Validate
        `keywords` is an array; trim + drop blanks server-side; if the resulting list is
        empty → `VALIDATION_ERROR` 400 (defense-in-depth; portal also guards).
  - [ ] Create a `semantic-scorer` job via `createJob<SemanticResults>(...)` seeded with
        `createEmptySemanticSummary()` (and, if the registry seeds initial results,
        `createEmptySemanticResults()`), respond `202` with `{ jobId, status,
        endpointName }` (identical shape to the location route), kick the processor via
        `setImmediate`. Use the shared error envelope helper; log id/counts only.
  - [ ] Default to a thread-backed embedder when none is injected (injectable seam for
        tests, exactly like `createLocationScorerRouter`).
- [ ] Mount the router in `worker-node/src/app.ts` next to `createLocationScorerRouter`,
      threading an optional `semanticEmbedder` through `CreateAppOptions`.
- [ ] Tests:
  - [ ] `processor.test.ts` (mock embedder — no real model download):
    - [ ] best-keyword selection (highest cosine wins); **negative best → `failures` row
          with `reason: "no_score"`** (not a silent skip); embed-keywords-once (assert
          keyword embedding count == keyword count, not × articles); keyword cache survives
          a recycle (no re-embed of keywords after a timeout).
    - [ ] rerun skips already-scored rows (into `skippedIds`); blank-text rows → `skippedIds`.
    - [ ] per-article **timeout** → `failures` row `reason: "timeout"`, `summary.failed`
          incremented, worker recycled (terminate + pending rejected), fresh worker
          reloaded, loop continues to later rows.
    - [ ] non-timeout article error → `failures` row `reason: "error"`, continue.
    - [ ] **all-skipped run** (no eligible text) → results carry `skippedIds`, `scores`
          empty, job terminal status **`failed`**, summary `processed === 0`.
    - [ ] **all-failed run** (every eligible row times out / errors / no-score) → results
          carry `failures`, `scores` empty, job terminal **`failed`**.
    - [ ] **mixed-success run** (≥1 valid score + some skipped/failed) → results carry all
          three lists, job terminal **`completed`**, `summary.processed >= 1`.
    - [ ] abort between rows stops new work; a recycle while aborted does not respawn
          needlessly.
    - [ ] **fixed model** — embedder factory/config exposes no model parameter and ignores
          any `SEMANTIC_SCORER_MODEL`/`SEMANTIC_SCORER_DTYPE` env values (assert the model
          used is always `SEMANTIC_MODEL`).
    - [ ] **sanitized failures** — every `failures[].reason` is one of
          `"timeout" | "error" | "no_score"` and never contains article text/embeddings.
  - [ ] `routes.test.ts`: `start-job` validates `articles` + `keywords` (empty keywords →
        400); creates a `semantic-scorer` job; status envelope carries `summary` +
        `modelLoading`; generic poll/cancel still work; results keyed by `id` and include
        `scores` / `skippedIds` / `failures`.
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
- [ ] Create `portal/src/lib/worker/semanticClient.ts`: `SemanticResults` type (including
      `failures: { article_id: string; reason: string }[]` per **§ Result contract**) and
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
  - [ ] `applySemanticRatings(scores, skippedIds, failures)` — merge-by-id like
        `applyLocationRatings`, now with the **failures** channel per **§ Result contract**:
        - scored ids → `semanticRatingMax` (number) / `semanticRatingMaxLabel` /
          `semanticRatingStatus: "scored"` (clear any prior `semanticRatingError`).
        - `skippedIds` → `semanticRatingMax: null` / `semanticRatingStatus: "skipped"`.
        - `failures` ids → `semanticRatingMax: null` / `semanticRatingStatus: "failed"` /
          `semanticRatingError = reason` (the sanitized `"timeout" | "error" | "no_score"`).
        - An id present in more than one list should not occur (processor guarantees
          disjoint lists); if it does, prefer `scored` > `failed` > `skipped` and leave a
          code comment noting the invariant.
  - [ ] `setSemanticKeywordDraft(draft)`.
  - [ ] Clear `semanticRun`, `semanticKeywordDraft`, and the semantic `Article` fields
        (`semanticRatingMax`, `…MaxLabel`, `…Status`, `…Error`) on `setArticles` (new
        search) and `resetFlow` (so the draft falls back to the default list — exactly
        like `statePromptDraft`).
- [ ] Tests: `semanticClient` start-job call shape; reducer tests for
      `applySemanticRatings` merge-by-id covering **all three channels** (scored number,
      skipped null, failed null + sanitized error + `status: "failed"`), `setSemanticRun`,
      `setSemanticKeywordDraft`, and draft/field clearing on `setArticles`/`resetFlow`;
      semantic proxy route test (mirror location route test).

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
        `setSemanticRun(toSemanticRunStatus(job))`.
  - [ ] **Apply results on any terminal that carries them (§ Zero-valid-rating terminal
        behavior):** when `terminalJob.results` is present, dispatch
        `applySemanticRatings(results.scores, results.skippedIds, results.failures)` for
        `completed`, `cancelled`, **and** `failed` — so skipped/failed rows render `N/A`
        even on a zero-valid `failed` run. Do **not** gate result application on
        `completed` only.
  - [ ] **Empty/failed terminal message:** when the terminal status is `failed`, or when
        `summary.processed === 0` (every row skipped/failed/no-score), show a clear
        empty/failed message (e.g. "No articles produced a valid semantic rating.") and
        **do not** enable Finish. This is distinct from the success readout.
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
      cell logic: `undefined` → empty cell (not yet run); number → `RatingCircle`; `null`
      (skipped **or** failed) → `N/A`. **No `RatingCircle` change** is needed. Remove the
      unused `semanticRating` placeholder accessor/field per the chosen reconciliation.
- [ ] Update `portal/src/components/layout/FlowIndicatorBar.tsx`: add a `semantic` clause
      to `canAdvance` — `true` only when `state.semanticRun?.status === "completed"` **and**
      `state.semanticRun.summary.processed > 0` (≥1 valid score), per **§ Terminal-stage
      Finish contract**.
- [ ] Update `portal/src/components/layout/FlowIndicator.tsx` to implement the
      **§ Terminal-stage Finish contract**:
  - [ ] `const isTerminal = !nextStage;`
  - [ ] Button label: `isTerminal ? "Finish" : "Next"` (swap/guard the `ArrowRight`/`Check`
        icon as appropriate — presentational).
  - [ ] `disabled`: `isTerminal ? !canAdvance : (!canAdvance || !nextStage)`.
  - [ ] `onClick` (`handleNext`): when `isTerminal`, **no-op** (do not dispatch `setStage`);
        otherwise dispatch `setStage(nextStage.key)` as today. Keep it accessible (e.g.
        `aria-label`/title indicating pipeline completion).
  - [ ] Completion rules (PRD §5.9): ≥1 valid rating → `completed` + Finish enabled; every
        row failed/skipped → run is `failed`, stay on the step with the empty/failed
        message, Finish disabled; mixed → `completed` + Finish enabled, failed/skipped rows
        visible as `N/A`.
- [ ] **Optional** (PRD §5.8): a `SemanticModal` (pattern of `ScrapeModal`) showing best
      keyword + current-run status/error (the sanitized failure type), in-memory only.
      Skip if time-constrained.
- [ ] Tests:
  - [ ] `SemanticBar` gating (disabled until ≥1 article, empty-keyword warning, disabled +
        Cancel while running, model-loading label, cancel preserves completed scores).
  - [ ] `SemanticBar` **terminal coverage**: mixed-success → success readout + Finish
        enabled path; **all-skipped** and **all-failed** (`failed` terminal,
        `processed === 0`) → empty/failed message shown, results still applied so rows show
        `N/A`, Finish **not** enabled. These mirror the Phase 3 processor test cases.
  - [ ] `SemanticKeywordEditor` seeds default + disabled during run + resets to default on
        new flow/reset.
  - [ ] semantic cell rendering for empty (`undefined`) / score (number) / `N/A`
        (`null`, both skipped and failed).
  - [ ] `FlowIndicator` terminal contract: on the terminal stage the label is **Finish**,
        the button is **enabled when `canAdvance` is true even though `nextStage` is
        `undefined`**, disabled when `canAdvance` is false, and clicking Finish does **not**
        dispatch `setStage` (no-op). Non-terminal stages keep the **Next** label/behavior.
  - [ ] `FlowIndicatorBar` `canAdvance` for `semantic`: true only for `completed` +
        `processed > 0`; false for `failed`/`running`/zero-valid.
  - [ ] `page.test.tsx` smoke still passes.

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
      model-loading state, circle percentages, `N/A` for skipped **and** failed rows,
      Finish gating (enabled only after a run with ≥1 valid score), that cancel preserves
      completed scores, and that refresh/reset restores the default keyword list.
- [ ] Manual terminal-path checks tied to the V02 fixes:
  - [ ] **Finish affordance:** after a successful run the terminal button reads **Finish**
        and is **enabled**; clicking it is a no-op (does not navigate away / change stage).
  - [ ] **Zero-valid run:** force an all-skipped or all-failed run (e.g. all blank text or a
        keyword set guaranteed to score ≤ 0) and confirm the run ends `failed`, rows show
        `N/A`, the empty/failed message appears, and Finish stays disabled.
  - [ ] If feasible, exercise a slow/stuck article (e.g. an oversized text) to confirm the
        run recovers and continues after the recycle, the row shows as `failed`/`N/A`, and
        capture rough recycle+reload timing as a note.
- [ ] Final review: confirm no durable persistence was added, no full-NewsNexus12 runtime
      dependency was introduced, no model/dtype override exists, the `failures` channel is
      sanitized (no content/embeddings logged or surfaced), and no lockfile/env/unrelated
      files were modified.
- [ ] Commit any remaining verification fixes per AGENTS.md (reference Phase 6). This is
      the final stage — there is no stage 7; do not pre-build anything beyond §5.
