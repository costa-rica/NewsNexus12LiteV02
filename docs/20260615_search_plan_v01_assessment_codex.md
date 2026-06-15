---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Search Plan V01 Assessment

Assessment result: v02 recommended before todo creation.

I reviewed `docs/20260615_search_plan_v01.md` against the active repository docs outside `docs/archive/`: `docs/PLAN_AND_VET.md`, `docs/20260615_build_sequence.md`, `docs/20260615_portal_todo_v02.md`, and `docs/NewsNexus12LiteV02_prd.md`.

## Qualifying concerns

1. The article object omits the required stable row id from the Foundation contract.

- Search plan lines 85-92 and 101-104 define RSS item mapping and the article object as `{ title, link, description, source, pubDate, content }`.
- Foundation TODO lines 111-115 require every `Article` to include `id: ArticleId`, described as the stable per-row id and in-memory key for every later stage.
- If an implementing agent follows the search plan literally, `setArticles` will receive objects that do not satisfy the stage-1 state contract. This risks type failures in stage 2 and unstable row identity for later scrape, location, state, and semantic writes.
- v02 should explicitly require an `id` to be assigned before articles enter the working set. Either the route can return `id` values or the client success mapper can add them, but the plan should name the chosen owner and keep the ids ephemeral.

2. The proposed route path conflicts with the portal `src/app` structure.

- Search plan line 67 names the route as `POST app/api/google-rss/make-request/route.ts`.
- Foundation TODO lines 242-247 establish `src/app/layout.tsx` and `src/app/page.tsx`, meaning the portal is expected to use a `src/app` App Router layout.
- If the search todo copies the plan path literally, the route may be created under the wrong app root or introduce a parallel `app/` tree.
- v02 should name the expected path as `portal/src/app/api/google-rss/make-request/route.ts`, or defer the exact path to the completed Foundation layout if the implementation lands differently.

3. The plan depends on Foundation, but the active docs still show Foundation as unfinished.

- Build sequence line 14 says not to start the next stage until the current stage is implemented, tested, and committed.
- Search plan lines 23-32 assume Foundation already provides the portal app, working article set, all-column table, and article object shape.
- Foundation TODO lines 331-338 still describe the final commit phase as a future checklist item.
- This makes the search plan premature for todo creation or implementation. The plan itself can exist as a draft, but v02 should be produced after Foundation is complete so it can bind to actual file names, state action names, and article type names instead of leaving the main contract as an open question.

## Non-blocking notes

1. The Google RSS query behavior, `when:7d` default, env defaults, 20s timeout, server-side fetch, response shape, zero-result handling, and no-persistence rules appear aligned with the PRD's Google RSS section.
2. The plan correctly keeps worker-node, jobs, polling, scraping, and durable ingestion out of scope for the Search stage.

## Recommendation

Do not create the Search todo from v01. Have the planner produce `docs/20260615_search_plan_v02.md` after Foundation is implemented and committed, incorporating the stable `ArticleId` mapping and corrected route path.
