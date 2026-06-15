---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Nexus Location Rating — Plan V01

## Roadmap context

- This is **part 4 of 6**. Full sequence: Foundation → Search → Scrape → **Location** → State → Semantic. See `docs/20260615_build_sequence.md`.
- Implements **§3 "Nexus Location Rating Section"** of `docs/NewsNexus12LiteV02_prd.md`.
- **Reuses the generic job/poll/cancel contract introduced in stage 3** (worker-node job registry, `GET /jobs/:jobId`, `POST /jobs/:jobId/cancel`, portal `jobClient`). This stage adds only a workflow-specific `start-job` route + processor and a portal control — **no new poll/cancel routes**.
- Runs the model in **worker-node** (Node), not worker-python — per `docs/20260616_arch_assessment_claude.md` (location rating reimplemented in Node via Transformers.js).
- The table renders **all 7 columns** from stage 1; this stage only populates the **Nexus Location Rating** column (the existing `RatingCircle` cell). Do not reorder/restructure the table or touch State/Semantic fields.
- All data is **ephemeral/in-memory**. Never persist ratings, classifier responses, run summaries, or job records.
- Stay within this stage's scope; do not pre-build state/semantic behavior.

## Goal

For each article in the working set, run a Hugging Face zero-shot classifier and store the probability that the events "Occurred in the United States" as the **Nexus Location Rating**, displayed as a percentage in a colored circle.

## Dependency gate

- Reuses the **Scrape** stage's generic worker job infrastructure and consumes `article.scrape` content. Scrape (stage 3) is planned but not yet implemented.
- Per `docs/20260615_build_sequence.md`, do **not** create the Location TODO or implement until **Scrape (stage 3) is committed and green**. Re-verify the real generic job contract, `jobClient`, run-status state shape, and `ScrapeResult` content fields then; if they differ, revise to a plan V02.

## Source flow to imitate (NewsNexus12 worker-python, read-only for parity)

- `worker-python/src/routes/location_scorer.py`
- `worker-python/src/modules/location_scorer/{config,types,orchestrator,repository}.py`
- `worker-python/src/modules/location_scorer/processors/{load,classify,write}.py`
- `worker-python/tests/unit/location_scorer/*`

The Python worker exposes `POST /location-scorer/start-job`, runs ordered steps `load → classify → write`, and writes scores to Postgres. Lite **reimplements the same workflow in Node**, processes the in-memory working set, and persists nothing. (Skip `repository.py` DB behavior.)

## Architecture (worker-node, reusing the generic contract)

```
portal (Location step)                worker-node
  └─ locationClient ──start──▶  POST /location-scorer/start-job   (workflow-specific, NEW)
  └─ jobClient.pollJob ─────▶  GET  /jobs/:jobId                  (GENERIC, reused)
  └─ jobClient.cancelJob ───▶  POST /jobs/:jobId/cancel           (GENERIC, reused)
```

- Add a `location-scorer` processor to worker-node that runs on the generic job runner/registry from stage 3.
- The HF classifier is created **lazily** on first run and **reused** across articles within the runtime (do not reload per article).
- Portal adds a thin `locationClient.startLocationJob(articles)` over the generic `jobClient`, and a "Start Rating" control. Results merge into `article.locationRating` by `id` (reuse the stage-3 merge-by-id pattern; add a `applyLocationRatings` action or generalize the existing merge).

## Technology & packages (worker-node)

- `@huggingface/transformers` (Transformers.js) — `pipeline("zero-shot-classification", model)`.
- Model: **`Xenova/bart-large-mnli`** (ONNX port of the source's `facebook/bart-large-mnli`).
- No Python, no `transformers` PyPI dependency, no DB models.

## Environment variables (worker-node)

| Var | Default | Use |
|-----|---------|-----|
| `LOCATION_SCORER_MODEL` | `Xenova/bart-large-mnli` | zero-shot model id |
| `TRANSFORMERS_CACHE` (or lib default) | lib default | local model cache dir (first download is large/slow) |

(The source `LOCATION_SCORER_BATCH_SIZE`/`limit` are not needed: the Lite working set is already bounded by the Search limit and applied in memory.)

## Job contract additions

- `POST /location-scorer/start-job` — body `{ articles: Article[] }`; creates a `location-scorer` job via the generic registry; returns `{ jobId, status: "queued", endpointName: "location-scorer" }`.
- The generic `GET /jobs/:jobId` envelope carries workflow-specific fields for this stage:
  - `summary`: `{ mode: "score", currentStep: "load"|"classify"|"write", eligible, processed, skipped }`
  - a **model-loading** indicator (e.g. `summary.modelLoading: true`) so the UI can show a distinct "loading model" state separate from per-article classification progress.
  - `results`: `LocationScore[]` keyed by article `id`.

## Classification pipeline (sequential — imitates the Python processors)

1. **load**: collect eligible in-memory rows and count them. Eligible = has usable text after trimming (see input rules). If the user reruns in the same flow, **skip rows that already have a `locationRating`** (mirrors `get_unscored_articles`) unless an explicit rerun/reset is offered.
2. **classify**: lazily build the classifier; for each eligible article call zero-shot classification with the exact candidate labels:
   - `"Occurred in the United States"`
   - `"Occurred outside the United States"`
   - Store the score attached to **`"Occurred in the United States"`** (not the first/winning label). Clamp to `0..1`.
   - If the US label is missing from a result → **fail the run** (mirrors `US label missing from classifier result`).
3. **write**: apply the score objects back onto the matching rows by `id`. Do not mutate Search/Scrape fields.

### Input text rules

- Assemble classifier input as:
  ```
  <title>

  <best available article text>
  ```
- Best text precedence: successful **scraped content** (`article.scrape.content`, success) → article **description** → RSS **`content`** (if present and no scraped content).
- Trim title and body. If **both** are blank after trimming, **skip** that article (leave its rating unset / `N/A`); continue.

### Score shape (in-memory only)

```json
{ "article_id": "<id>", "score": 0.0, "rating_for": "Occurred in the United States" }
```

Keep the raw classifier score available in run state for the current flow; do **not** store or display the "Occurred outside the United States" score.

## Portal integration

- **Location action**: extend `StageActionArea` with the `"location"` branch — a **Start Rating** button (disabled until the working set has ≥1 article and while a run is in progress).
- **Run**: Start Rating → `startLocationJob(articles)` → `jobClient.pollJob` → dispatch run-status updates and merge ratings by id. Surface progress mapped to the steps (loading candidate rows → classifying *m/n* → applying scores) and a **distinct model-loading state** when `modelLoading` is set.
- **Next gating**: disabled while running; enabled when the run completes with **≥1 classified** article. If every article was skipped (zero classified) → stay on the step with a clear empty-result message. Mixed skipped/classified → allow advancing, keep skipped rows visible.

## Table display

- The **Nexus Location Rating** column already renders via Foundation's `RatingCircle` (column maps `locationRating` → `RatingCircle`); convert the 0..1 score to a percentage (`Math.round(score * 100)`); higher = greener, lower = duller (existing color mapping).
- Before a run, cells stay empty. After a run, **skipped** rows must show **`N/A`** (not a percentage and not blank-as-unrun). This requires distinguishing skipped from not-yet-run — e.g. represent skipped as a sentinel the cell renders as `N/A` (small `RatingCircle`/cell extension; today `RatingCircle` renders `null` for `null|undefined`). Decide the exact representation at TODO time.
- If sorting is enabled at this step, unset/skipped sort last.

## Ephemerality & error/cancel rules

- Do not read NewsNexus12 `Articles`/`ArtificialIntelligences`/contracts or write any durable scoring table; store ratings and run state in memory only.
- New flow / refresh / `resetFlow` clears all location ratings and run state.
- **Model load failure** → run `failed`, leave existing ratings unchanged.
- Classification failure **before write** → no partial ratings from that attempt.
- Malformed/missing-label result → fail the run (no misleading score).
- Blank-text article → skip only that row, continue.
- Cancel/reset mid-run → stop processing, clear in-progress run state; a cancelled run does **not** enable Next unless a previous completed run's ratings are still present.

## Out of scope

- State assignment / OpenAI (stage 5) and semantic scoring (stage 6).
- worker-python, PyPI `transformers`, Postgres, DB models, durable score persistence, the source `limit`/batch behavior.
- New poll/cancel routes (reuse the generic ones).

## Testing approach

- **worker-node unit**: input-text assembly + precedence (scraped > description > RSS), skip-when-blank, label set exactness, US-score extraction (not first/winning), missing-US-label → run failure, clamp 0..1, rerun skips already-rated rows. Mock the classifier (no real model download in tests); add one optional integration test (guarded/skippable) that loads the real model.
- **job/route**: `start-job` creates a `location-scorer` job; status envelope includes step + `modelLoading`; generic poll/cancel still work; results keyed by id.
- **portal**: `locationClient` + merge-by-id; run-status UI incl. distinct model-loading state; Next gating (disabled running; enabled ≥1 classified; empty-result when all skipped); `RatingCircle` percentage + `N/A` for skipped; `page.test.tsx` still passes.
- End of phase: type/lint, tests, build per `PLAN_AND_VET.md`.

## Risks / open questions

- **Node↔Python score parity**: `Xenova/bart-large-mnli` (ONNX) should match `facebook/bart-large-mnli`, but validate scores against the Python worker early; if they diverge materially, escalate (worker-python fallback is the architecture's stated contingency).
- **First-load cost**: the model download/initialization is large and slow; the distinct model-loading UI state is required, and tests must mock the model.
- **`N/A` vs empty display**: needs a concrete representation distinguishing skipped from not-yet-run — finalize in the TODO and confirm the `RatingCircle`/cell change stays presentational.
- **Contract drift**: depends on the not-yet-implemented stage-3 generic job contract and run-status state; re-verify at TODO time.
