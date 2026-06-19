---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Semantic Rating — Plan V02

## Revision note (changes relative to V01)

This V02 supersedes `docs/20260619_semantic_rating_plan_v01.md` and addresses the two
qualifying concerns in `docs/20260619_semantic_rating_plan_v01_assessment_codex.md`. Only the
two flagged areas changed; everything else is carried forward from V01 unchanged because it
remains valid.

1. **Per-article timeout under a single long-lived worker thread.** Codex correctly observed
   that a main-thread `Promise.race` cannot, by itself, free a worker that is stuck inside a
   hung embedding call: later article requests would queue behind the stuck call and the job
   could not reliably continue. V02 replaces "race only" with a **recycle-on-timeout** strategy
   (terminate the stuck worker, reject + clear its pending requests, spawn a fresh worker, lazily
   reload the model, continue with later articles). See **Worker-thread timeout & recycle
   strategy** below. The keyword-vector cache lives on the main thread, so a recycle never has to
   re-embed keywords. The continuation guarantee and its costs are stated precisely.

2. **Configurable model conflicts with the PRD's exact-model requirement.** V01 added a
   `SEMANTIC_SCORER_MODEL` (and `SEMANTIC_SCORER_DTYPE`) env override mirroring the location
   config. PRD `§5.5` requires the **exact** source model. V02 **removes the model override
   entirely**: the model id is a hardcoded, non-overridable constant, the embedder config helper
   exposes **no** model parameter, and no env var can change it. Any future model/dtype
   configurability is explicitly **out of scope** for this PRD section. See **Embedder
   configuration (fixed model)** and the revised **Environment variables** section.

No other behavioral change from V01 is intended.

## Roadmap context

- This is **part 6 of 6** (the final stage). Full sequence: Foundation → Search → Scrape → Location → State → **Semantic**. See `docs/20260615_build_sequence.md`.
- Implements **§5 "Nexus Semantic Rating" Section** of `docs/NewsNexus12LiteV02_prd.md` (lines 904–1135).
- The table renders **all 7 columns** from stage 1 (`portal/src/components/tables/columns.tsx`); this stage only **populates the existing `Nexus Semantic Rating` cell** (`semanticRating` accessor → `RatingCircle`). Do **not** reorder/restructure the table or touch Search/Scrape/Location/State fields.
- **Reuses the worker-node job/poll/cancel abstraction introduced in stage 3 and reused by stage 4 (Location).** This is a heavy Hugging Face model job, so it runs in **worker-node** behind a workflow-specific `start-job` route plus the **generic** `GET /jobs/:jobId` and `POST /jobs/:jobId/cancel` routes — **do not fork** that contract or add new poll/cancel routes.
- All pipeline data is **ephemeral/in-memory** — never add durable persistence (no DB, file, localStorage, browser storage, or worker queue records), with the single allowed exception of the **permanent default keyword list as checked-in app config** (see Default keywords).
- This is the **last** stage; do not pre-build anything beyond §5. There is no stage 7.

## Lite isolation (hard constraint)

- No runtime imports, HTTP calls, or DB usage from full NewsNexus12. The PRD `§5.11` source file list, the worker route `POST /semantic-scorer/start-job`, the API proxy `/news-orgs/automations/semantic-scorer/start-job`, the cursor targeting fields (`articleIdMinExclusive`, `articleIdMaxInclusive`), the `ArtificialIntelligence` / `EntityWhoCategorizedArticle` / `ArticleEntityWhoCategorizedArticleContract` lookups, and the `PATH_TO_SEMANTIC_SCORER_DIR` validation describe the **NewsNexus12 flow we imitate, not endpoints Lite builds**. Lite scores the current in-memory working set and implements none of that selection/persistence layer.
- The source reads keywords from `…/NewsNexusSemanticScorerKeywords.xlsx`. Lite must **not** read that absolute external path at runtime and must **not** add an xlsx parser dependency (worker-node has none today). The 25 default keywords are **embedded verbatim as a checked-in asset** (see Default keywords), mirroring how stage 5 embedded the default prompt in `portal/src/lib/state-assigner/defaultPrompt.ts`.
- Do **not** write `isRunningStatus.txt`, `lastRunCompleted.txt`, or any status file (`§5.2`). Progress lives in job/run state only.

## Goal

For each article in the current in-memory working set (after Search → Scrape → Location → State), embed the article's best available text with a Hugging Face **feature-extraction** model, embed each (default or user-edited) keyword, take the **single highest cosine-similarity keyword** per article, and populate the `Nexus Semantic Rating` column with that best score — storing the best keyword, best score, and per-row status in memory only.

## Source flow to imitate (NewsNexus12 worker-node `semanticScorer`, read-only for parity)

Per `§5.1` and `§5.11`, the source worker (`worker-node/src/modules/jobs/semanticScorerJob.ts`) loads the keyword workbook, lazily builds a `feature-extraction` embedder (`getEmbedder`), embeds each article and keyword, selects the best cosine-similarity keyword per article, and upserts only that best pair. Lite **re-implements the same scoring math** over the in-memory working set and persists nothing. The DB selection (`get unscored articles`, AI-entity resolution, contract filtering/upsert) and status-file writing are **skipped**.

## Architecture (worker-node, reusing the generic contract)

```
portal (Semantic step)                  worker-node
  └─ semanticClient.startJob ──▶  POST /semantic-scorer/start-job   (workflow-specific, NEW)
  └─ jobClient.pollJob ───────▶  GET  /jobs/:jobId                  (GENERIC, reused)
  └─ jobClient.cancelJob ─────▶  POST /jobs/:jobId/cancel           (GENERIC, reused)
```

- Add a `semantic-scorer` module to worker-node that runs on the **existing generic job registry/runner** (`createJob`, `markRunning`, `updateProgress`, `setResults`, `complete`, `fail`, `job.abortController.signal`) — the exact primitives the location processor uses.
- **Run the embedder off the main event loop in a worker thread**, reusing the proven seam from stage 4's location 502 fix (`threadClassifier.ts` + `classifier.worker.ts`, see `docs/archive/20260617_worker_node_location_offload_plan_v01.md`). Feature-extraction of a large set on the main thread would block `/jobs/:jobId` polls and reproduce the same `502`/`fetch failed` class of bug. The thread owns one lazily-built, reused embedder — **but**, unlike location, the thread embedder must support **recycle-on-timeout** so a hung embedding call can be abandoned and processing can continue (see **Worker-thread timeout & recycle strategy**).
- Portal adds a thin `semanticClient.startSemanticJob(articles, keywords)` over the generic `jobClient`, a **Start Rating** control (`SemanticBar`, the analog of `LocationBar`), and a **keyword editor below the table** (the analog of `StatePromptEditorSlot`).

## Technology & packages

- **worker-node:** `@huggingface/transformers` (already a dependency, `^3.8.1`) — `pipeline("feature-extraction", model)`. No new package.
  - Model: **`Xenova/paraphrase-MiniLM-L6-v2`** (`§5.5`), task **`feature-extraction`**. This is **fixed** — see **Embedder configuration (fixed model)**.
  - Embedder built **lazily** and **reused** for the runtime, matching source `getEmbedder` (`§5.5`).
  - Embed options for **both** article text and each keyword: `{ pooling: "mean", normalize: true }` (`§5.5`). Because vectors are L2-normalized, cosine similarity reduces to a dot product, but compute cosine explicitly for clarity/parity.
- **portal:** Next.js UI, the generic `jobClient`, and reducer state. No model code in the portal.

## Embedder configuration (fixed model) — CHANGED in V02

PRD `§5.5` requires the **exact** source model (`Xenova/paraphrase-MiniLM-L6-v2`, task
`feature-extraction`), and the semantic score is the feature being demonstrated, so the
embedding model must not be swappable for this stage.

- The model id is a **hardcoded, non-overridable constant** in `semantic-scorer/types.ts`:
  `export const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2";`
- **Do not add a `SEMANTIC_SCORER_MODEL` env var** and do **not** copy the location
  `loadLocationScorerConfig` model-from-env pattern (`worker-node/src/modules/location-scorer/config.ts`).
  Any `semantic-scorer/config.ts` helper **must not** accept or read a model id; the embedder
  factory references the `SEMANTIC_MODEL` constant directly so there is **no runtime code path**
  that can score with a different model.
- **No dtype override either.** V02 also drops the V01 `SEMANTIC_SCORER_DTYPE` env knob and uses
  the `@huggingface/transformers` **library default** dtype, matching source `getEmbedder`
  behavior, so neither the model nor its quantization can drift the demonstrated scores away from
  source parity. (dtype is a quantization detail, not a different model, but it can subtly alter
  embeddings, so for this stage it is left at the source/library default and is not configurable.)
- **Future model/dtype configurability is explicitly out of scope** for this PRD section. If a
  later requirement wants to make the model selectable, that is a separate plan; this stage ships
  a single fixed model to satisfy `§5.5`.

## Default keywords (`§5.3`, `§5.4`)

- The 25 default keywords from `§5.3` are embedded **verbatim** as a checked-in constant — the single source of truth for "default", e.g. `portal/src/lib/semantic-scorer/defaultKeywords.ts` (exporting the ordered list) with a parity copy/import path available to worker-node tests if needed. This is the **only** permanent config this stage adds and it survives restarts (`§5.2`, `§5.4`).
- The list (order preserved): consumer product safety; cpsc safety alert; hazardous product warning; defective product injury; product-related accident; home safety hazards; home safety; child injury product; fire hazard consumer product; electric shock incident; poisoning household product; carbon monoxide poisoning product; burn injury consumer product; burn injury; choking hazard; laceration product defect; mechanical failure injury; mechanical injury; electrical appliance fire; sports equipment injury; toxic household chemicals; playground equipment accident; electrical fire; playground accident; toxic chemical.
- The source workbook rules (first worksheet `Keywords`, skip header row 1, column A only, ignore blanks, string-trim each, no persisted edits) are **reference for how the 25 were derived** (`§5.3`) — embedding captures the result without reading the file. Document this mapping in the asset's comment.
- Do **not** write edited keywords back to the workbook or any durable config (`§5.4`).

## Editable keyword section (`§5.4`)

- Below the articles table (same slot pattern as `StatePromptEditorSlot`), render a **keyword editor** that is visible only when `currentStage === "semantic"`. Recommended UI: a multiline `<textarea>` (one keyword per line) seeded from the default list — simplest, mirrors the existing prompt editor; chips/editable-list are acceptable alternatives (`§5.4`).
- Seeded from the **default list on every new flow / reset / refresh** (`§5.4`). The draft lives in **in-memory current-state only** — add `semanticKeywordDraft?: string` (or `string[]`) to `FlowState`, cleared on `setArticles` and `resetFlow` so it naturally falls back to the default (exactly like `statePromptDraft`).
- Freely editable before a run; **disabled while a run is active** (`queued`/`running`) until it finishes/fails/cancels (`§5.4`).
- **Normalization at run start:** trim every keyword and drop blanks (`§5.4`). If **zero non-blank** keywords remain, do **not** start the job — show a warning that at least one keyword is required (`§5.4`, `§5.10`). The snapshot of the keyword list actually used is kept in run state so the UI can show what produced the results (`§5.4`).

## Worker job contract additions

- `POST /semantic-scorer/start-job` — body `{ articles: SemanticArticleInput[], keywords: string[] }`.
  - Validate `articles` is an array of objects each with a non-empty string `id` (reuse the location route's `isLocationArticleInput` shape check). Validate `keywords` is an array; trim + drop blanks server-side as defense-in-depth; if the resulting list is empty → `VALIDATION_ERROR` 400 (`§5.4`, `§5.10`) — the portal also guards this before calling.
  - Create a `semantic-scorer` job via `createJob<SemanticResults>(...)`, respond `202` with `{ jobId, status, endpointName }` (identical shape to the location route), and kick the processor via `setImmediate`.
- Reuse the **generic** `GET /jobs/:jobId` envelope; this stage's `summary` carries:
  - `{ eligible, processed, skipped, failed, modelLoading }` (numbers only, matching `JobSummary`). `modelLoading: 1` while the embedder loads — including **after a recycle, while the fresh worker reloads** (`§5.5`) — `0` otherwise.
  - `results`: `{ scores: SemanticScore[], skippedIds: string[] }` keyed by article `id`.
- Mount the new router in `app.ts` next to the location router; default to a **thread-backed embedder** when none is injected (keep an injectable seam for tests, exactly like `createLocationScorerRouter`).

## Worker-thread timeout & recycle strategy (`§5.9`) — NEW in V02

The PRD requires a per-article `10000ms` timeout and, on timeout, "skip that article, record the
timeout in memory, and continue processing later articles" (`§5.9`). Because one long-lived worker
owns the model and processes messages sequentially, a main-thread `Promise.race` alone cannot
satisfy this: if the embedding call is genuinely stuck, the worker stays busy and later requests
queue behind it. V02 therefore makes the per-article timeout **recycle the worker**, not just race
it.

**Thread embedder surface (mirrors `threadClassifier.ts`, with one added method):**

- `load(): Promise<void>` — lazily spawns the worker and loads the fixed model (as today).
- `embed(text): Promise<number[]>` — feature-extraction of one text (the semantic analog of
  `score`), tracked by a per-request id in a `pendingEmbeds` deferred map.
- `recycle(reason): void` — **new.** Terminates the current worker, rejects + clears every entry
  in `pendingEmbeds` (and any in-flight `load`) with a recoverable error, and nulls
  `worker`/`loadPromise` so the next `load()`/`embed()` lazily spawns a **fresh** worker and
  reloads the model. This extends the existing `failWorker` cleanup, which already rejects
  pending deferreds and nulls the worker on `error`/`exit`; `recycle` adds an explicit
  `worker.terminate()` and is callable on demand (not only on crash). The existing `error`/`exit`
  handlers continue to converge on the same cleanup so a crashed worker also respawns.

**Processor behavior per article (replaces V01's "under a 10000ms timeout" wording):**

1. Start the article embed: `const p = embedder.embed(text)`.
2. Race it against a `10000ms` timer (`Promise.race([p, timeout])`).
3. **On success within budget:** clear the timer, score the article, `updateProgress`, continue.
4. **On the `10000ms` timeout firing first:**
   - Record the timeout for that row in `summary.failed` (skip-with-status; rating left unset).
   - Call `embedder.recycle("article_timeout")`. This terminates the stuck worker so the hung
     embed cannot keep the next request queued, and rejects the timed-out request's deferred so it
     can never later resolve into the wrong row.
   - Set `summary.modelLoading = 1`, `await embedder.load()` to bring up a fresh worker + reloaded
     model, then `modelLoading = 0`, and **continue** with later articles.
   - The keyword vectors were embedded once up front and **cached on the main thread** (see
     scoring step 2), so a recycle does **not** re-embed keywords — only the model is reloaded.
5. **On an article-level embedding/scoring error (rejection that is not a timeout):** record the
   failure in `summary.failed` and continue (`§5.9`). No recycle is required for a normal
   rejection because the worker is not stuck; but if the rejection came from the worker `error`/
   `exit` path, the existing handler has already respawned for the next request.
6. Honor `job.abortController.signal` **between** articles (and skip a pending recycle/reload if
   already aborted) to support cancel.

**What is guaranteed vs. what is not:**

- **Guaranteed:** after any single article hangs, the stuck worker is terminated and a fresh worker
  is brought up, so subsequent eligible articles are processed rather than blocked behind the hang.
  The timed-out request can never resolve into a later row's result (its deferred is rejected and
  removed). The run still reaches a terminal state.
- **Cost / not guaranteed:** each timeout pays a **model reload** in the fresh worker before the
  next article (first-load cost, mitigated by the model-loading UI state). This is acceptable for
  the bounded, single-user demo set. We do **not** attempt to interrupt or salvage the in-flight
  computation inside the terminated worker, and we do **not** guarantee a hard 10000ms wall-clock
  cap on *total* per-article cost (recycle + reload add overhead after the 10s budget); the 10s
  bound is on *waiting for the embed result* before abandoning it, matching the PRD's intent that a
  slow/stuck article must not stall the whole run.
- **Repeated-timeout safety:** the recycle path is idempotent and bounded by the article count;
  there is no unbounded retry of the same article (a timed-out article is recorded and skipped, not
  retried). If the model fails to reload after a recycle, treat it like a model-load failure for
  the remainder of the run (mark the run `failed`, preserve already-applied scores per
  Incremental results).

This `recycle` method and its protocol (terminate + reject-pending + lazy respawn) are unit-testable
with a stubbed worker/port exactly like `threadClassifier.test.ts`.

## Scoring pipeline (sequential — imitates the source loop)

Module layout mirrors `location-scorer/` (`config.ts`, `types.ts`, `embedder.ts`, `embedder.worker.ts` + `.worker.types.ts`, `threadEmbedder.ts`, `articleText.ts`, `cosine.ts`, `processor.ts`, `routes.ts`). Per **Embedder configuration (fixed model)**, `config.ts` carries no model parameter.

1. **load step** — Collect eligible rows. Eligible = produces usable text after trimming (see Input text) **and** does not already carry an in-memory semantic rating (rerun skip, `§5.6`). Count eligible vs skipped; `updateProgress(job, 0, summary)`.
2. **embed keywords once** — Set `summary.modelLoading = 1`, `await embedder.load()`, then embed **each keyword vector once up front** (not per article) and **cache them on the main thread** for the run. Clear `modelLoading = 0`. (Embedding keywords once per run, not per article, is the meaningful perf choice — the source embeds keywords per run, articles in the loop.) Because this cache lives on the main thread, a later per-article worker recycle never needs to re-embed keywords. If a keyword embed itself times out/hangs, apply the same recycle-then-retry-once approach; if keyword vectors still cannot be produced, **fail the run** (scoring is impossible without them).
3. **score step (per article, sequential, `§5.9`)** — For each eligible article, apply the **per-article 10000ms timeout + recycle-on-timeout** strategy defined in **Worker-thread timeout & recycle strategy**:
   - Embed the article text (`pooling: "mean"`, `normalize: true`).
   - Compute cosine similarity vs every cached keyword vector; pick the **single highest** (`§5.5`).
   - If the best score is **negative**, or no keyword can be selected → treat as **no semantic score** (skip-with-status), leave rating unset (`§5.5`).
   - On success, append `{ article_id, keyword, keywordRating }` (the source persisted shape, `§5.5`) and `updateProgress`.
   - **Timeout** → record a timeout for that row (`failed` count), **recycle + reload**, and **continue** to later rows (`§5.9`).
   - **Article-level embedding/scoring error** → record the failure and **continue** (`§5.9`). Honor `job.abortController.signal` between articles to support cancel.
4. **write step** — Apply the best keyword/score back to matching rows by `id`; do not mutate Search/Scrape/Location/State fields (`§5.7`). See "Incremental results & cancel" for when `setResults` is called.

### Input text (`§5.6`)

Add a `pickArticleText(article)` helper — **do not reuse** the location `buildClassifierInput`, which concatenates `title + body` with a different precedence. Semantic returns a **single** best text:

1. Successful **scraped content** (`scrape.status === "success"` and `scrape.content` non-blank after trim).
2. Else article **description** (when scraped content is missing/failed/blank/unusable).
3. Else article **title** (when both scraped content and description are blank).
4. Trim. If nothing usable remains → **skip** that row, leave its rating unset (`§5.6`).

This preserves the source `pickArticleText` (description → title) while enriching with the richer in-memory scrape data, per `§5.6`.

### Cosine similarity

A pure `cosineSimilarity(a, b)` helper (dot over magnitude product; guard zero magnitude → 0). Pure and trivially unit-testable, like location's `extractUsScore`.

## Data / state shapes (in-memory only)

worker-node (`semantic-scorer/types.ts`):

```ts
export const SEMANTIC_MODEL = "Xenova/paraphrase-MiniLM-L6-v2"; // fixed; no env override (§5.5)

export interface SemanticArticleInput {
  id: string;
  title?: string;
  description?: string;
  content?: string;
  scrape?: { status?: "success" | "fail"; content?: string };
  semanticRatingMax?: number | null; // already-scored rows are skipped on rerun
}

export interface SemanticScore {
  article_id: string;
  keyword: string;       // best matching keyword (source: "keyword")
  keywordRating: number; // best cosine similarity (source: "keywordRating")
}

export interface SemanticResults {
  scores: SemanticScore[];
  skippedIds: string[];
}

export interface SemanticSummary {
  eligible: number;
  processed: number;
  skipped: number;
  failed: number;     // timeouts + article-level errors + no-valid-score
  modelLoading: number; // 1 while loading (initial load AND post-recycle reload), else 0
}
```

portal (`portal/src/state/types.ts`) — extend `Article` with the PRD `§5.7` fields and a run status that mirrors `LocationRunStatus`:

```ts
// Article additions:
semanticRatingMax?: number | null;      // best cosine score (display value)
semanticRatingMaxLabel?: string;         // best matching keyword
semanticRatingStatus?: "scored" | "skipped" | "failed"; // current-run status
semanticRatingError?: string;            // current-run diagnostic only

interface SemanticRunSummary {
  eligible: number; processed: number; skipped: number; failed: number; modelLoading: number;
}
interface SemanticRunStatus {
  status: "idle" | "running" | "completed" | "failed" | "cancelled";
  processed: number; total: number;
  summary: SemanticRunSummary;
  keywordsUsed?: string[]; // snapshot of the keyword list used for THIS run (§5.4)
}
// FlowState gains: semanticRun?: SemanticRunStatus; semanticKeywordDraft?: string;
```

**Column-accessor reconciliation (Risk):** `columns.tsx` currently maps the `semanticRating` accessor → `RatingCircle`, and `Article.semanticRating?: number | null` is a placeholder from Foundation. The PRD names the field `semanticRatingMax`. Recommended: store the canonical value in **`semanticRatingMax`**, repoint the semantic column to read `semanticRatingMax`, and remove/deprecate the unused `semanticRating` placeholder (grep shows only `columns.tsx` + `types.ts` reference it). Finalize the exact rename at TODO time; either way the displayed number is the best cosine score.

## Portal integration

- **Action area:** add a `"semantic"` branch to `StageActionArea` → `<SemanticBar />` (the analog of `LocationBar`): a **Start Rating** button (PRD step 5), progress label, summary readout, model-loading state, and warnings/errors. Disabled until the working set has ≥1 article, while running, and when the trimmed keyword list is empty.
- **Run orchestration** (reuse `LocationBar.handleRate` shape): snapshot the trimmed keyword list into `semanticRun.keywordsUsed`; `dispatch(setSemanticRun({status:"running", …}))`; `startSemanticJob(articles, keywords)` → `pollJob<SemanticResults, SemanticRunSummary>(jobId, { onUpdate })` dispatching `setSemanticRun(toSemanticRunStatus(job))`; on terminal, `applySemanticRatings(results.scores, results.skippedIds)`.
- **Keyword editor:** `SemanticKeywordEditorSlot` rendered after `<ArticlesTable />` in `page.tsx` (next to the existing `StatePromptEditorSlot`), returning `null` unless `currentStage === "semantic"`; seeded from `defaultKeywords`, bound to `semanticKeywordDraft`, disabled while the run is active.
- **Reducer:** add `setSemanticRun`, `applySemanticRatings` (merge-by-id like `applyLocationRatings`: scored ids get `semanticRatingMax`/`MaxLabel`/`status:"scored"`; `skippedIds` get `semanticRatingMax: null`/`status:"skipped"`), and `setSemanticKeywordDraft`; clear `semanticRun` + `semanticKeywordDraft` (and semantic article fields) on `setArticles` and `resetFlow`.
- **Optional details modal/tooltip** (`§5.8`): a `SemanticModal` (pattern of `ScrapeModal`) showing best keyword + current-run status/error. In-memory only; optional for this stage.

## Table display (`§5.8`)

`RatingCircle` already renders a percentage circle with `Math.round(score*100)`, normalizes to `0..1`, greener-for-higher — exactly the PRD's spec — so **no `RatingCircle` change is needed**. The semantic cell logic mirrors the location cell in `columns.tsx`:

- Before a run / not yet scored (`undefined`) → **empty** cell.
- Scored (`semanticRatingMax` is a number) → `RatingCircle` with that score.
- Skipped / no-valid-score (`semanticRatingMax === null`, i.e. `status` `skipped`/`failed`) → **`N/A`** (the same `null`-renders-`N/A` sentinel the location column uses to distinguish skipped from not-yet-run).
- If sorting is enabled later, unset/skipped sort last (`§5.8`) — forward-compatible guidance; sorting isn't wired today.

## Lifecycle / progress / cancel / Next-Finish gating (`§5.9`)

- On Start: set `semanticRun.status` to `running`, disable **Start**, the **Next/Finish** action, and the **keyword editor** until finish/fail/cancel.
- Progress: show `processed / eligible` plus the summary readout (Eligible / Scored / Skipped / Failed), reusing the `LocationBar` status-card layout, and a distinct **"Loading model…"** label when `summary.modelLoading === 1` (`§5.5`, `§5.9`). Note this label can re-appear mid-run after a timeout recycle reloads the model — that is expected.
- Sequential processing with the per-article `10000ms` timeout and recycle-on-timeout (`§5.9`, see **Worker-thread timeout & recycle strategy**). The source logs every 100 articles + writes status files; Lite shows progress in UI state only (`§5.9`).
- **Cancel:** a Cancel button calls `cancelJob(jobId)`; the processor stops issuing new embeds between articles (signal check). A cancelled run **preserves only completed row scores already applied** (`§5.10`) — see Incremental results.
- **Next / Finish gating** (`§5.9`): Semantic is the **terminal** stage — `getNextStage("semantic")` is `undefined`, so the existing `FlowIndicator` "Next" button is already disabled at this stage. Add a `semantic` clause to `FlowIndicatorBar.canAdvance` for consistency (true when `semanticRun.status === "completed"` and ≥1 valid score), and decide at TODO time whether to relabel the terminal action **"Finish"** (a small `FlowIndicator` label tweak) or leave the disabled "Next" as the end state. Recommended: relabel to **Finish** on the last stage for a clear end-of-flow affordance; this is presentational only.
  - Completion rules (`§5.9`): ≥1 valid rating → mark `completed` (Finish enabled). Every row failed/skipped → stay on the step with a clear failed/empty message. Mixed → allow finishing, keep failed/skipped rows visible as `N/A`.

## Incremental results & cancel semantics (`§5.7`, `§5.10`)

Location applies results **only** on `completed` (all-or-nothing). The PRD `§5.10` instead wants a **cancelled** run to keep completed row scores. Recommended: have the processor call `setResults(job, { scores, skippedIds })` **after each successful article** (or small batch) so the latest poll — terminal *or* cancelled — always carries the completed scores, and the portal applies `terminalJob.results` for `completed` **and** `cancelled`. This satisfies `§5.10` ("failures should not clear successful ratings already produced during the same run") and is a deliberate, documented divergence from the location all-or-nothing write. Failures before any successful write produce no ratings (`§5.10`). A timeout recycle does not discard already-applied scores because those live in `setResults`, not in the worker.

## Error states (`§5.10`)

- **Default keyword list cannot be loaded** → setup error; keep **Start Rating disabled** (`§5.10`). With keywords embedded as a checked-in constant this is essentially unreachable, but the Start guard and an empty-list message cover it.
- **Empty edited keyword list** → do not call the model; warning (`§5.4`, `§5.10`).
- **Model fails to load** (initial load, or reload after a recycle) → mark the run `failed`; **leave existing table ratings unchanged** beyond any already-applied per-row successes (`§5.10`).
- **Per-article timeout** → record in-memory, recycle the worker + reload, continue later rows (`§5.9`).
- **Per-article embedding error** (non-timeout) → record in-memory, continue later rows (`§5.9`).
- **Cancel** → stop, preserve already-applied completed scores (`§5.10`).
- Surface enough failure detail for demo debugging (counts, statuses, failure types — including timeout vs. error vs. no-valid-score) but **do not persist** it; log via the worker-node Winston logger / portal `serverLogger` per AGENTS.md — never log article content, embeddings, or full payloads.

## Ephemerality & reset (`§5.2`)

- Store each semantic rating only on the in-memory `article.semanticRatingMax` / `…MaxLabel` / `…Status` / `…Error`; store per-run progress, selected keyword, skipped/timeout/failure counts, and the keyword snapshot only in `semanticRun` / component state.
- New flow, `resetFlow`, `setArticles` (new search), and page **refresh** clear all semantic ratings, `semanticRun`, and the keyword draft (which then falls back to the default list) (`§5.2`, `§5.4`).
- Do **not** query or write `Articles`, `ArticleApproveds`, `ArticleEntityWhoCategorizedArticleContract`, `ArtificialIntelligences`, `EntityWhoCategorizedArticle`, or any durable table/file/queue (`§5.2`).

## Environment variables (worker-node) — CHANGED in V02

| Var | Status | Notes |
|-----|--------|-------|
| `SEMANTIC_SCORER_MODEL` | **Not added (removed from V01)** | The model is the hardcoded `SEMANTIC_MODEL` constant; PRD `§5.5` requires the exact source model, so there is no override. |
| `SEMANTIC_SCORER_DTYPE` | **Not added (removed from V01)** | dtype uses the `@huggingface/transformers` library default to match source `getEmbedder`; not configurable for this stage. |

No `PATH_TO_SEMANTIC_SCORER_DIR` (keywords are embedded). No new portal env vars. This stage adds **no new worker-node env vars at all**. First model download is large/slow — handled by the model-loading UI state and worker-thread warm-up (optional, as location does at boot). Future model/dtype configurability is out of scope (see Embedder configuration).

## Testing & verification strategy (do not run here)

- **worker-node unit (vitest, mock the embedder — no real model download in CI):**
  - `cosineSimilarity`: identical vectors → 1; orthogonal → 0; zero-magnitude guard; negative case.
  - `pickArticleText` precedence: scraped-success > description > title; trim; skip when all blank.
  - best-keyword selection: highest cosine wins; **negative best → no score**; embed-keywords-once (assert keyword embedding count == keyword count, not × articles); keyword cache survives a recycle (no re-embed of keywords after an article timeout).
  - rerun skips rows that already have `semanticRatingMax`; blank-text rows skipped; keyword trim/blank-ignore.
  - per-article **timeout** → row recorded as failed, **worker recycled (terminate + pending rejected/cleared)**, fresh worker reloaded, and the loop continues to score later rows; article error (non-timeout) → continue; abort between rows stops new work; a recycle while aborted does not respawn needlessly.
  - **fixed model:** the embedder factory/config exposes no model parameter and ignores any `SEMANTIC_SCORER_MODEL`/`SEMANTIC_SCORER_DTYPE` env values (assert the model used is always `SEMANTIC_MODEL`).
  - one optional **guarded/skippable** integration test that loads the real model and scores a tiny set.
- **worker-node route/thread:** `start-job` validates `articles` + `keywords` (empty keywords → 400); creates a `semantic-scorer` job; status envelope carries `summary` + `modelLoading`; generic poll/cancel still work; results keyed by `id`; thread protocol load/embed message correlation **and the `recycle` protocol** (terminate + reject-pending + lazy respawn) with a stubbed port, like `threadClassifier.test.ts`.
- **portal:** `semanticClient` + `applySemanticRatings` merge-by-id; `SemanticBar` gating (disabled until ≥1 article, empty-keyword warning, disabled + Cancel while running, model-loading label); `SemanticKeywordEditor` seeds default + disabled during run + resets to default on new flow/reset; semantic cell rendering for empty / score / `N/A`; `FlowIndicatorBar`/Finish gating for `semantic`; reducer `setSemanticRun` / `applySemanticRatings` / keyword-draft clear on `setArticles`/`resetFlow`; `page.test.tsx` smoke still passes.
- **Phase gate:** type-check, lint, tests, build per `PLAN_AND_VET.md`. Manual: enter Semantic stage, view default keywords, edit them, Start Rating on a small set, confirm progress + model-loading state, circle percentages, `N/A` for skipped, Finish gating, cancel preserves completed scores, and that refresh/reset restores the default keyword list. If feasible, manually exercise a slow/stuck article (e.g. an oversized text) to confirm the run recovers and continues after the recycle.

## Risks / open questions

- **Recycle reload cost.** Each per-article timeout pays a model reload in a fresh worker. For the bounded single-user demo set this is acceptable, but many consecutive timeouts would be slow; capture rough recycle+reload timing during manual verification. (Mitigated by the model-loading UI state; bounded by article count, no retry of the timed-out row.)
- **Column-accessor rename.** Repointing the semantic column from the placeholder `semanticRating` to `semanticRatingMax` (or aliasing) — pick one at TODO time; both keep the displayed number as the best cosine score.
- **Incremental vs all-or-nothing write.** `§5.10` requires cancel to preserve completed scores, so this plan recommends incremental `setResults`. If the assessor prefers location-style terminal-only writes, cancel would keep nothing — a `§5.10` conflict to resolve before TODO.
- **Cosine range / display.** Cosine similarity is `[-1, 1]`; negatives are treated as "no score" (`§5.5`), and `RatingCircle` clamps to `0..1`, so low positives render as a dull circle and negatives/none as `N/A`. Confirm this is the intended visual.
- **First-load cost & thread parity.** Reusing the worker-thread embedder is required to avoid the stage-4 `502` polling bug; validate the feature-extraction pipeline behaves under thread isolation (and under the new `recycle`/respawn path) as the zero-shot one did, and capture rough cold-load/per-article timings during manual verification.
- **Keyword-embedding cache scope.** Keyword vectors are cached per run on the main thread (recomputed when the edited list changes between runs, and reused across a mid-run recycle) — confirm no cross-run reuse is expected.

## Out of scope

- Any stage 7 (there is none) and any change to Search / Scrape / Location / State fields or display.
- **Any model/dtype configurability** (env override or otherwise) — the model is fixed to `Xenova/paraphrase-MiniLM-L6-v2` per `§5.5`; future selectability is a separate plan.
- The source `POST /semantic-scorer/start-job` DB behavior, the API automation proxy, cursor/article-id targeting, AI-entity/contract resolution, `get-unscored-articles` DB selection, and all durable persistence (DB, files, status files, queue records).
- Reading or parsing the external `NewsNexusSemanticScorerKeywords.xlsx` at runtime; adding an xlsx parser dependency; writing edited keywords back to any durable store.
- New worker poll/cancel routes (reuse the generic ones); worker pools / parallel inference / batching beyond the bounded in-memory set.

## Next step

Submit this plan (v02) for assessment per `PLAN_AND_VET.md`. Once it has no qualifying concerns, produce a phased TODO (this is multi-step — a TODO is warranted) and vet it before implementation. Implement only after the prior stages remain green.
</content>
</invoke>
