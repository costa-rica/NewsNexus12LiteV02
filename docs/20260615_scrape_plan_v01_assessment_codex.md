---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# Scrape Plan V01 Assessment

Assessment result: v02 recommended before todo creation.

I reviewed `docs/20260615_scrape_plan_v01.md` against the active repository docs outside `docs/archive/`: `docs/PLAN_AND_VET.md`, `docs/20260615_build_sequence.md`, `docs/20260615_search_todo_v01.md`, and `docs/NewsNexus12LiteV02_prd.md`. I also checked the current portal shell files relevant to the plan contract.

## Qualifying concerns

1. The poll and cancel endpoints are scrape-specific even though this stage is supposed to establish the reusable job/poll abstraction.

- Scrape plan lines 14 and 42 say stage 3 introduces a reusable portal-worker job/poll contract that stages 4 and 6 should consume rather than fork.
- Build sequence lines 24-26 and 43-45 say portal owns polling, worker-node owns heavy jobs, and the job/poll abstraction is established in stage 3 and reused by stages 4 and 6.
- Scrape plan lines 36-37 and 83-85 define status and cancel as `/article-content-scraper-02/job/:jobId` and `/article-content-scraper-02/job/:jobId/cancel`, which bakes polling and cancellation into the scrape endpoint namespace.
- That shape risks forcing Location and Semantic to add their own endpoint-specific poll/cancel routes later, which is exactly the architecture the roadmap says to avoid. It also diverges from the NewsNexus12 worker pattern, where start routes are endpoint-specific but status and cancellation are exposed through generic queue-info routes.
- v02 should define a reusable Lite worker job API, for example endpoint-specific `POST /article-content-scraper-02/start-job` plus generic `GET /jobs/:jobId` and `POST /jobs/:jobId/cancel`, or another clearly shared status/cancel shape. The portal client should then be described as generic start/poll/cancel plumbing with scrape as the first consumer.

2. The plan misstates the current `ScrapedCell` behavior, which can produce false success checks for failed scrapes.

- Scrape plan lines 116-118 require the Scraped cell to show a check mark only when `status === "success"` and content is at least 200 characters, then says Foundation's `ScrapedCell` already renders empty otherwise.
- Current `portal/src/components/tables/cells/ScrapedCell.tsx` renders a check mark for any non-empty `scrape` object and does not inspect `status` or content length.
- Scrape plan line 110 says scrape results should be merged into articles by id. If failed `ScrapeResult` objects are merged into `article.scrape` and the implementer trusts the parenthetical, failed rows will show the success check mark and open the scraped-content control.
- v02 should explicitly require updating `ScrapedCell` and the table/modal wiring so only successful, sufficiently long content produces the check mark. It should also specify whether failed results are stored on `article.scrape`, kept only in run-status diagnostics, or represented by a separate field, so the table behavior is unambiguous.

## Non-blocking notes

1. The main scrape pipeline is otherwise aligned with PRD §2: Google URL resolution, direct publisher fetch before browser fallback, Cheerio parsing, sequential processing, failure vocab, no durable persistence, and Next enabled after run completion.
2. The dependency gate is appropriate: the plan should not advance to Scrape todo or implementation until Search is committed and green.

## Recommendation

Do not create the Scrape todo from v01. Have the planner produce `docs/20260615_scrape_plan_v02.md` with a reusable job status/cancel contract and corrected `ScrapedCell` requirements.
