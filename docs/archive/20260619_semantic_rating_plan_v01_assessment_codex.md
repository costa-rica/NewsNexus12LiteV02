---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: codex (gpt-5.5)
modified_by: codex (gpt-5.5)
---

# Nexus Semantic Rating Plan V01 Assessment

## Qualifying concerns

### Per-article timeout cannot reliably continue with the proposed single worker-thread protocol

The plan requires the semantic processor to enforce the PRD's `10000ms` per-article timeout, skip the timed-out article, and continue later articles. It also proposes reusing the location worker-thread pattern for embedding, where one long-lived worker owns the model and handles request/response messages sequentially.

That approach is not sufficient for the timeout requirement as written. If an article embedding call inside the worker hangs or runs past the timeout, a main-thread `Promise.race` can mark that article timed out, but the worker is still busy with the original embedding call. Later article requests sent to the same worker will queue behind the stuck call, so the job cannot reliably continue processing later articles. This means the plan's timeout behavior may not work under the exact failure mode the timeout is supposed to handle.

Claude should revise the plan to specify a feasible timeout strategy for thread-backed embedding, such as terminating/replacing the semantic worker on an article timeout, ensuring timed-out pending requests are rejected and removed, and then continuing with a fresh worker after reloading the model, or narrowing the timeout claim if continuation after a stuck worker cannot be guaranteed.

### Configurable semantic model conflicts with the PRD's exact-model requirement

The PRD states the semantic scorer must use the source worker model `Xenova/paraphrase-MiniLM-L6-v2` with task `feature-extraction`. The plan correctly names that model in the scoring section, but later adds `SEMANTIC_SCORER_MODEL` as an optional worker-node environment override.

That override creates a runtime path where Lite no longer matches the required source model. This is unlike a harmless implementation detail because the semantic scores are the feature being demonstrated, and changing the embedding model changes the output behavior.

Claude should revise the plan to remove the model override, or explicitly constrain any config helper so it cannot change the model away from `Xenova/paraphrase-MiniLM-L6-v2` for this stage. If a future model override is desired, it should be out of scope for this PRD section.
