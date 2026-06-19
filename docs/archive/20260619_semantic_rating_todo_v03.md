---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Semantic Rating — TODO V03

Implementation checklist for the approved plan
`docs/20260619_semantic_rating_plan_v02.md` (stage 6 of 6, final stage — PRD §5
"Nexus Semantic Rating", `docs/NewsNexus12LiteV02_prd.md` lines 904–1135).

This is a task list, not a design doc. Read the V02 plan and PRD §5 before starting,
then work the phases in order. Each phase ends with a verification gate and a commit.
Do not start a later phase until the previous phase's gate passes and is committed.

## Revision note (changes relative to TODO V02)

This V03 supersedes `docs/20260619_semantic_rating_todo_v02.md` and resolves the single
qualifying concern in `docs/20260619_semantic_rating_todo_v02_assessment_codex.md`. Only
the flagged rerun behavior changed; the three V02 fixes (terminal Finish contract, failed
row result contract, zero-valid terminal behavior) and every other carried-forward item
remain valid and intact.

1. **Rerun no longer erases existing semantic ratings (V03 fix).** V02 routed
   already-scored rerun rows into `skippedIds`, and the reducer applies every `skippedId`
   as `semanticRatingMax: null` / `semanticRatingStatus: "skipped"`. So starting a second
   semantic run in the same flow would convert previously scored rows to `N/A` and erase
   their scores; worse, a rerun where **every** row was already scored produced
   `scores.length === 0`, marked the job `failed`, published all prior rows in `skippedIds`,
   and the portal applied them on the `failed` terminal — erasing all ratings **and**
   disabling Finish. This conflicts with PRD §5.6 ("skip rows that already have an in-memory
   Nexus Semantic Rating unless the UI explicitly provides a rerun/reset action"). V03
   introduces a **separate `alreadyScoredIds` channel**: already-scored rerun rows go there
   (never into `skippedIds`), the reducer **leaves those rows untouched** (it does not write
   any semantic field for them), and `skippedIds` now means **only** no-usable-text rows
   that should display `N/A`. The terminal-status and Finish-gating logic counts both new
   scores **and** already-scored rows as valid ratings, so an all-already-scored rerun ends
   `completed` with ratings preserved and Finish still enabled. See
   **§ Result contract for scored / skipped / already-scored / failed rows**,
   **§ Terminal-stage Finish contract**, **§ Zero-valid-rating terminal behavior**, and
   Phases 1, 3, 4, 5.

The three V02 fixes are unchanged and still required:

2. **Terminal-stage Finish contract is explicit** (V02). `FlowIndicator` disables on
   `disabled={!canAdvance || !nextStage}` and `getNextStage("semantic")` is `undefined`, so
   a label-only change would leave Finish permanently disabled even after a successful run.
   The terminal stage reads **Finish**, its disabled state is driven by **`canAdvance` only**
   (not `nextStage`), and clicking it is a **no-op completed affordance** (it must **not**
   call `setStage`). See **§ Terminal-stage Finish contract** and Phase 5.

3. **Worker result contract carries failed rows** (V02). `SemanticResults` exposes a
   **`failures: { article_id: string; reason: string }[]`** channel so the reducer can mark
   timeout/error/no-score rows as `semanticRatingStatus: "failed"` / `semanticRatingError`,
   with a **sanitized** `reason` (`"timeout" | "error" | "no_score"` — never article
   content, embeddings, or stack traces). See **§ Result contract** and Phases 3–5.

4. **Zero-valid-rating terminal behavior is defined end to end** (V02, refined in V03). The
   processor **always publishes final results** (`scores`, `skippedIds`, `alreadyScoredIds`,
   `failures`) and then marks the job **`failed`** when there are **zero valid ratings**
   (no new scores **and** no already-scored rerun rows), while the portal applies those
   results so rows still render `N/A`, shows an empty/failed message, and keeps Finish
   disabled. See **§ Zero-valid-rating terminal behavior** and Phases 3 & 5.

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

These subsections define the cross-cutting contracts that resolve the V01 and V02
assessments. Each implementation task below references them; keep them consistent across
worker-node and portal.

### Result contract for scored / skipped / already-scored / failed rows

The single canonical worker result shape for this stage is:

```ts
export interface SemanticResults {
  scores: SemanticScore[];                          // valid ratings produced THIS run
  skippedIds: string[];                             // NO-USABLE-TEXT rows only → display N/A
  alreadyScoredIds: string[];                       // NEW in V03 — rerun rows already carrying a rating
  failures: { article_id: string; reason: string }[]; // per-row failure rows (V02)
}
```

- **`scores`** — rows that produced a valid best keyword/score **this run**. Reducer sets
  `semanticRatingMax` (number), `semanticRatingMaxLabel`, `semanticRatingStatus: "scored"`
  (and clears any prior `semanticRatingError`).
- **`skippedIds`** — rows with **no usable text** (blank after `pickArticleText`). This is
  the **only** meaning of `skippedIds` in V03: rows that should display `N/A`. Reducer sets
  `semanticRatingMax: null`, `semanticRatingStatus: "skipped"`. **Already-scored rerun rows
  must never be placed here** (that was the V02 bug).
- **`alreadyScoredIds`** — **NEW in V03.** Rows skipped on rerun **because they already carry
  an in-memory semantic rating** (PRD §5.6). The reducer treats this channel as a **no-op**:
  it writes **no** semantic field for these ids and **leaves their existing
  `semanticRatingMax` / `…MaxLabel` / `…Status` / `…Error` unchanged**. They are reported
  only so the count/terminal logic and tests can reason about them; they are **not** "N/A"
  rows and **not** failures.
- **`failures`** — rows attempted this run that failed: per-article **timeout**, per-article
  **non-timeout embedding/scoring error**, or **no-valid-score** (negative best / no
  selectable keyword). Reducer sets `semanticRatingMax: null`,
  `semanticRatingStatus: "failed"`, and `semanticRatingError` = the sanitized `reason`.
- **`reason`** is a **sanitized failure type only**, one of `"timeout"` | `"error"` |
  `"no_score"`. It **must not** contain article content, embeddings, message bodies, file
  paths, or stack traces (AGENTS.md). The same set of `failed`-count rows that increment
  `summary.failed` must appear in `failures` so the count and the row list stay in sync.
- A given article id appears in **exactly one** of `scores` / `skippedIds` /
  `alreadyScoredIds` / `failures`. The processor guarantees these four lists are disjoint.

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
  `semanticRun?.status === "completed"` **and** there is **≥1 valid rating present on the
  table** — i.e. `(semanticRun.summary.processed > 0 || semanticRun.summary.alreadyScored >
  0)`. Counting `alreadyScored` here is the V03 fix: a rerun where every row was already
  scored has `processed === 0` but must still keep Finish enabled because valid ratings
  remain on the table. This stays consistent with the zero-valid path below (which yields
  status `failed`, so `canAdvance` is naturally `false`); assert both the
  newly-scored and the all-already-scored cases explicitly.

### Zero-valid-rating terminal behavior

A run yields **zero valid ratings** only when there are **no new scores this run AND no
already-scored rerun rows** (every eligible row blank/skipped, timed out, errored, or
produced no valid score, and nothing was carried in from a prior run). Define
`validRatings = scores.length + alreadyScoredIds.length` and drive the terminal decision
off it:

- The processor **always publishes final results first** via `setResults(job, { scores,
  skippedIds, alreadyScoredIds, failures })` (so skipped/failed rows render and
  already-scored rows are reported even on a non-success terminal), **then**:
  - `validRatings >= 1` → `complete(job, summary)` (success path). This includes a rerun
    where `scores.length === 0` but `alreadyScoredIds.length >= 1` (all rows already scored)
    — it must end **`completed`**, not `failed`, so prior ratings are preserved and Finish
    stays enabled.
  - `validRatings === 0` → `fail(job, …)` with a sanitized reason (no content). Skipped/
    failed ids are already in the published results so the table can render `N/A`. (`failed`
    — not `complete` — so the successful Finish path is never enabled with no ratings, and
    the "stay on the step" PRD §5.9 behavior holds without extra portal guards.)
- The portal applies `terminalJob.results` (scores + skippedIds + alreadyScoredIds +
  failures) on **any** terminal status that carries results — `completed`, `cancelled`,
  **and** `failed`. Because `alreadyScoredIds` is a no-op in the reducer, applying results on
  a `failed` rerun terminal can **never** erase existing ratings. Finish gating still depends
  only on `completed` + `(processed > 0 || alreadyScored > 0)`, so a true zero-valid `failed`
  run keeps Finish disabled and shows the empty/failed message.
- A **model-load failure** (initial or post-recycle) also terminates as `failed`; publish
  whatever results exist (already-applied per-row successes and the `alreadyScoredIds` list
  are preserved). The portal's empty/failed message covers both zero-valid and load-failure
  cases.

---

## Phase 1 — worker-node pure helpers, types, and default-keyword parity

Build the leaf modules under `worker-node/src/modules/semantic-scorer/` mirroring the
`location-scorer/` layout. These are pure/unit-testable and carry no model parameter.

- [ ] Create `semantic-scorer/types.ts` with the fixed model constant and in-memory
      shapes: `export const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2";`,
      `SemanticArticleInput` (include `semanticRatingMax?: number | null` so the processor
      can detect already-scored rerun rows), `SemanticScore` (`article_id`, `keyword`,
      `keywordRating`), `SemanticResults` (`scores`, `skippedIds`, **`alreadyScoredIds:
      string[]`** per **§ Result contract**, **`failures: { article_id: string; reason:
      string }[]`**), and `SemanticSummary` (`eligible`, `processed`, `skipped`,
      **`alreadyScored`**, `failed`, `modelLoading`). Add a
      `createEmptySemanticSummary()` helper (analog of `createEmptyLocationSummary`,
      `alreadyScored` seeded `0`) and a `createEmptySemanticResults()` helper
      (`{ scores: [], skippedIds: [], alreadyScoredIds: [], failures: [] }`).
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
- [ ] Add a tiny pure predicate (e.g. `hasExistingRating(article)` in `articleText.ts` or
      `types.ts`) that reports whether an input row already carries an in-memory semantic
      rating — `typeof article.semanticRatingMax === "number"` (a numeric score). This is
      the single source of truth for the rerun "already-scored" decision so the processor
      and its tests agree; `null` (a prior skip/failure) is **not** treated as
      already-scored.
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
  - [ ] `hasExistingRating` (rerun predicate): numeric `semanticRatingMax` → true; `null`,
        `undefined`, and a non-number → false.
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
Honor **§ Result contract**, **§ Zero-valid-rating terminal behavior**, and the rerun
distinction (`alreadyScoredIds` vs `skippedIds`) throughout.

- [ ] Create `semantic-scorer/processor.ts` (`runSemanticJob({ job, articles, keywords,
      embedder })`) implementing the sequential pipeline from plan §"Scoring pipeline".
      Maintain four running accumulators — `scores: SemanticScore[]`,
      `skippedIds: string[]`, `alreadyScoredIds: string[]`, and `failures: { article_id;
      reason }[]` — alongside `summary`:
  - [ ] **load step (rerun-aware, PRD §5.6):** classify every input row into exactly one
        bucket, in this order:
        1. **Already scored** (`hasExistingRating(article)` is true) → push id to
           `alreadyScoredIds`, increment `summary.alreadyScored`, and **do not** score it.
           This is the rerun skip — it is **not** a `skippedId` and **not** a failure.
        2. Else **no usable text** (`pickArticleText` returns blank) → push id to
           `skippedIds`, increment `summary.skipped`.
        3. Else **eligible** → add to the work list, increment `summary.eligible`.
        Then `updateProgress(job, 0, summary)`. (Eligible therefore excludes both
        already-scored and no-text rows.)
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
        leave rating unset, and continue. (This is a **failure** row, not a `skippedId` or
        `alreadyScoredId`, so the table shows it as a current-run `failed`/`N/A` per
        **§ Result contract**.)
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
        alreadyScoredIds, failures })` after each successful article (or small batch) so
        the latest poll — terminal or cancelled — always carries completed scores **and**
        the failed/skipped/already-scored row lists. This is a deliberate, documented
        divergence from the location all-or-nothing write.
  - [ ] **completion (§ Zero-valid-rating terminal behavior):** publish final results
        (`setResults(job, { scores, skippedIds, alreadyScoredIds, failures })`) **before**
        the terminal transition, then compute
        `validRatings = scores.length + alreadyScoredIds.length`:
        - `validRatings >= 1` → `complete(job, summary)` (success path). This explicitly
          includes the **all-already-scored rerun** case (`scores.length === 0` but
          `alreadyScoredIds.length >= 1`) — it must end `completed`, never `failed`.
        - `validRatings === 0` (all blank/skipped/timed-out/errored/no-score and nothing
          carried in) → `fail(job, …)` with a sanitized reason (no content). Skipped/failed
          ids are already in the published results so the table can render `N/A`.
        - model fails to load (initial or post-recycle) → publish whatever results exist
          (preserving already-applied per-row successes and the `alreadyScoredIds` list)
          then `fail(job, …)`.
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
    - [ ] **first run** with mixed rows: blank-text rows → `skippedIds`; scorable rows →
          `scores`; assert no ids land in `alreadyScoredIds` when no input row carries a
          rating.
    - [ ] **rerun after a successful run (V03 fix):** feed inputs where some rows already
          carry a numeric `semanticRatingMax`. Assert those ids appear in
          `alreadyScoredIds` (and `summary.alreadyScored` is incremented), are **absent**
          from `skippedIds`, `scores`, and `failures`, were **not** re-embedded (the
          embedder is not called for them), and only the not-yet-scored rows are scored.
    - [ ] **all-already-scored rerun (V03 fix):** every input row already carries a rating
          → `scores` empty, `alreadyScoredIds` holds them all, `skippedIds`/`failures`
          empty, job terminal status **`completed`** (NOT `failed`), `summary.processed
          === 0`, `summary.alreadyScored === inputCount`. (This is the case the V02 bug
          marked `failed`.)
    - [ ] per-article **timeout** → `failures` row `reason: "timeout"`, `summary.failed`
          incremented, worker recycled (terminate + pending rejected), fresh worker
          reloaded, loop continues to later rows.
    - [ ] non-timeout article error → `failures` row `reason: "error"`, continue.
    - [ ] **all-skipped run** (no eligible text, no prior ratings) → results carry
          `skippedIds`, `scores`/`alreadyScoredIds` empty, job terminal status **`failed`**,
          summary `processed === 0`.
    - [ ] **all-failed run** (every eligible row times out / errors / no-score) → results
          carry `failures`, `scores`/`alreadyScoredIds` empty, job terminal **`failed`**.
    - [ ] **mixed-success run** (≥1 valid score + some skipped/failed) → results carry all
          four lists as applicable, job terminal **`completed`**, `summary.processed >= 1`.
    - [ ] **disjointness invariant:** across any run, every article id appears in exactly
          one of `scores` / `skippedIds` / `alreadyScoredIds` / `failures`.
    - [ ] abort between rows stops new work; a recycle while aborted does not respawn
          needlessly.
    - [ ] **fixed model** — embedder factory/config exposes no model parameter and ignores
          any `SEMANTIC_SCORER_MODEL`/`SEMANTIC_SCORER_DTYPE` env values (assert the model
          used is always `SEMANTIC_MODEL`).
    - [ ] **sanitized failures** — every `failures[].reason` is one of
          `"timeout" | "error" | "no_score"` and never contains article text/embeddings.
  - [ ] `routes.test.ts`: `start-job` validates `articles` + `keywords` (empty keywords →
        400); creates a `semantic-scorer` job; status envelope carries `summary` +
        `modelLoading` + `alreadyScored`; generic poll/cancel still work; results keyed by
        `id` and include `scores` / `skippedIds` / `alreadyScoredIds` / `failures`.
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
      `alreadyScoredIds: string[]` and `failures: { article_id: string; reason: string }[]`
      per **§ Result contract**) and `startSemanticJob(articles, keywords)` over the generic
      `startJob("semantic-scorer", { articles, keywords })` (analog of `locationClient.ts`).
      Include each row's current `semanticRatingMax` in the article payload so the worker can
      detect already-scored rerun rows. Define
      `SemanticJob = WorkerJob<SemanticResults, SemanticRunSummary>`.
- [ ] Add the API proxy route `portal/src/app/api/worker/semantic-scorer/start-job/route.ts`
      using `proxyWorkerRequest("/semantic-scorer/start-job", …)` (mirror the location
      start-job proxy). Reuse the existing generic `jobs/[jobId]` + cancel proxy routes —
      do **not** add new poll/cancel proxies.
- [ ] Extend `portal/src/state/types.ts`:
  - [ ] `Article` additions (PRD §5.7): `semanticRatingMax?: number | null`,
        `semanticRatingMaxLabel?: string`, `semanticRatingStatus?: "scored" | "skipped" |
        "failed"`, `semanticRatingError?: string`.
  - [ ] `SemanticRunSummary` (`eligible`, `processed`, `skipped`, **`alreadyScored`**,
        `failed`, `modelLoading`) and `SemanticRunStatus` (`status: "idle" | "running" |
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
  - [ ] `applySemanticRatings(scores, skippedIds, failures, alreadyScoredIds)` — merge-by-id
        like `applyLocationRatings`, now with the **failures** and **already-scored**
        channels per **§ Result contract**:
        - scored ids → `semanticRatingMax` (number) / `semanticRatingMaxLabel` /
          `semanticRatingStatus: "scored"` (clear any prior `semanticRatingError`).
        - `skippedIds` (no-usable-text) → `semanticRatingMax: null` /
          `semanticRatingStatus: "skipped"`.
        - `failures` ids → `semanticRatingMax: null` / `semanticRatingStatus: "failed"` /
          `semanticRatingError = reason` (the sanitized `"timeout" | "error" | "no_score"`).
        - **`alreadyScoredIds` → NO-OP (V03 fix):** the reducer writes **no** semantic field
          for these ids and leaves their existing `semanticRatingMax` / `…MaxLabel` /
          `…Status` / `…Error` exactly as they were. Leave a code comment stating that
          rerun-skipped rows keep their prior rating per PRD §5.6. (Accepting the parameter
          but not mutating these rows is the whole point; do not fall through to the
          `skipped` branch.)
        - An id present in more than one list should not occur (processor guarantees
          disjoint lists); if it does, prefer `scored` > `failed` > `skipped` >
          `alreadyScored` and leave a code comment noting the invariant.
  - [ ] `setSemanticKeywordDraft(draft)`.
  - [ ] Clear `semanticRun`, `semanticKeywordDraft`, and the semantic `Article` fields
        (`semanticRatingMax`, `…MaxLabel`, `…Status`, `…Error`) on `setArticles` (new
        search) and `resetFlow` (so the draft falls back to the default list — exactly
        like `statePromptDraft`).
- [ ] Tests: `semanticClient` start-job call shape (payload carries `semanticRatingMax`);
      reducer tests for `applySemanticRatings` merge-by-id covering **all four channels**
      (scored number, skipped null, failed null + sanitized error + `status: "failed"`, and
      **already-scored = unchanged**), `setSemanticRun`, `setSemanticKeywordDraft`, and
      draft/field clearing on `setArticles`/`resetFlow`; semantic proxy route test (mirror
      location route test). Add an explicit **rerun-preservation** reducer test: seed an
      article with an existing `semanticRatingMax`/`…MaxLabel`/`status: "scored"`, dispatch
      `applySemanticRatings([], [], [], [thatId])`, and assert all four semantic fields are
      byte-for-byte unchanged.

**Phase 4 gate:**
- [ ] portal type-check + lint.
- [ ] portal tests green.
- [ ] portal build.
- [ ] Verify no lockfile/env changes; commit per AGENTS.md (reference Phase 4).

---

## Phase 5 — portal UI integration (action area, keyword editor, table cell, Finish gating)

- [ ] Create `portal/src/components/semantic/SemanticBar.tsx` (analog of `LocationBar`):
      **Start Rating** button (PRD step 5), progress label (`processed / eligible`),
      summary readout (Eligible / Scored / Skipped / Already-scored / Failed) reusing the
      `LocationBar` status-card layout, a distinct **"Loading model…"** label when
      `summary.modelLoading === 1` (note it can re-appear mid-run after a timeout
      recycle), Cancel button while running, and warnings/errors. Disabled until the
      working set has ≥1 article, while running, and when the trimmed keyword list is
      empty.
  - [ ] Run orchestration (reuse `LocationBar.handleRate` shape): snapshot the trimmed
        keyword list into `semanticRun.keywordsUsed`; `dispatch(setSemanticRun({status:
        "running", …}))`; `startSemanticJob(articles, keywords)` → `pollJob<
        SemanticResults, SemanticRunSummary>(jobId, { onUpdate })` dispatching
        `setSemanticRun(toSemanticRunStatus(job))`. Ensure the articles passed carry their
        current `semanticRatingMax` so the worker can detect rerun rows.
  - [ ] **Apply results on any terminal that carries them (§ Zero-valid-rating terminal
        behavior):** when `terminalJob.results` is present, dispatch
        `applySemanticRatings(results.scores, results.skippedIds, results.failures,
        results.alreadyScoredIds)` for `completed`, `cancelled`, **and** `failed` — so
        skipped/failed rows render `N/A` even on a zero-valid `failed` run, while
        already-scored rerun rows are left untouched. Do **not** gate result application on
        `completed` only.
  - [ ] **Empty/failed terminal message:** when the terminal status is `failed`, or when
        there are zero valid ratings on the table (`summary.processed === 0` **and**
        `summary.alreadyScored === 0`), show a clear empty/failed message (e.g. "No articles
        produced a valid semantic rating.") and **do not** enable Finish. An
        all-already-scored rerun (`processed === 0` but `alreadyScored > 0`) is a **success**
        — show the normal readout, not the empty/failed message. This is distinct from the
        success readout.
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
      (skipped **or** failed) → `N/A`. Already-scored rerun rows keep their prior number,
      so they continue to render their `RatingCircle` with no special handling. **No
      `RatingCircle` change** is needed. Remove the unused `semanticRating` placeholder
      accessor/field per the chosen reconciliation.
- [ ] Update `portal/src/components/layout/FlowIndicatorBar.tsx`: add a `semantic` clause
      to `canAdvance` — `true` only when `state.semanticRun?.status === "completed"` **and**
      `(state.semanticRun.summary.processed > 0 || state.semanticRun.summary.alreadyScored >
      0)`, per **§ Terminal-stage Finish contract**. (Counting `alreadyScored` keeps Finish
      enabled after an all-already-scored rerun.)
- [ ] Update `portal/src/components/layout/FlowIndicator.tsx` to implement the
      **§ Terminal-stage Finish contract**:
  - [ ] `const isTerminal = !nextStage;`
  - [ ] Button label: `isTerminal ? "Finish" : "Next"` (swap/guard the `ArrowRight`/`Check`
        icon as appropriate — presentational).
  - [ ] `disabled`: `isTerminal ? !canAdvance : (!canAdvance || !nextStage)`.
  - [ ] `onClick` (`handleNext`): when `isTerminal`, **no-op** (do not dispatch `setStage`);
        otherwise dispatch `setStage(nextStage.key)` as today. Keep it accessible (e.g.
        `aria-label`/title indicating pipeline completion).
  - [ ] Completion rules (PRD §5.9): ≥1 valid rating (new or already-scored) → `completed` +
        Finish enabled; every row failed/skipped with no prior ratings → run is `failed`,
        stay on the step with the empty/failed message, Finish disabled; mixed → `completed`
        + Finish enabled, failed/skipped rows visible as `N/A`.
- [ ] **Optional** (PRD §5.8): a `SemanticModal` (pattern of `ScrapeModal`) showing best
      keyword + current-run status/error (the sanitized failure type), in-memory only.
      Skip if time-constrained.
- [ ] Tests:
  - [ ] `SemanticBar` gating (disabled until ≥1 article, empty-keyword warning, disabled +
        Cancel while running, model-loading label, cancel preserves completed scores).
  - [ ] `SemanticBar` **terminal coverage**: mixed-success → success readout + Finish
        enabled path; **all-skipped** and **all-failed** (`failed` terminal, zero valid
        ratings) → empty/failed message shown, results still applied so rows show `N/A`,
        Finish **not** enabled. These mirror the Phase 3 processor test cases.
  - [ ] `SemanticBar` **rerun coverage (V03 fix):** an all-already-scored rerun
        (`completed` terminal, `processed === 0`, `alreadyScored > 0`) shows the normal
        success readout (NOT the empty/failed message), keeps existing rows' `RatingCircle`
        values intact (no `N/A`), and Finish stays enabled.
  - [ ] `SemanticKeywordEditor` seeds default + disabled during run + resets to default on
        new flow/reset.
  - [ ] semantic cell rendering for empty (`undefined`) / score (number) / `N/A`
        (`null`, both skipped and failed).
  - [ ] `FlowIndicator` terminal contract: on the terminal stage the label is **Finish**,
        the button is **enabled when `canAdvance` is true even though `nextStage` is
        `undefined`**, disabled when `canAdvance` is false, and clicking Finish does **not**
        dispatch `setStage` (no-op). Non-terminal stages keep the **Next** label/behavior.
  - [ ] `FlowIndicatorBar` `canAdvance` for `semantic`: true for `completed` +
        `processed > 0`; **true for `completed` + `processed === 0` + `alreadyScored > 0`
        (rerun);** false for `failed`/`running`/zero-valid.
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
      Finish gating (enabled only after a run with ≥1 valid rating), that cancel preserves
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
- [ ] Manual rerun check tied to the V03 fix:
  - [ ] **Rerun preserves ratings (PRD §5.6):** after a successful run that scored ≥1 row,
        click **Start Rating again** without resetting. Confirm previously scored rows keep
        their exact `RatingCircle` values (they are **not** converted to `N/A`), the run
        ends **`completed`** (not `failed`), Finish stays **enabled**, and the summary shows
        the already-scored rows under Already-scored rather than Skipped/Failed.
- [ ] Final review: confirm no durable persistence was added, no full-NewsNexus12 runtime
      dependency was introduced, no model/dtype override exists, the `failures` channel is
      sanitized (no content/embeddings logged or surfaced), the `alreadyScoredIds` channel
      never clears existing ratings, and no lockfile/env/unrelated files were modified.
- [ ] Commit any remaining verification fixes per AGENTS.md (reference Phase 6). This is
      the final stage — there is no stage 7; do not pre-build anything beyond §5.
