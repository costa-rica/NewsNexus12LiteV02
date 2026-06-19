---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Build Sequence

This file directs the order in which NewsNexus12 Lite is built. It is the project-specific roadmap; `PLAN_AND_VET.md` is the generic planning process, and `NewsNexus12LiteV02_prd.md` is the master product spec.

## Core rule

The app is built in **6 sequential plan/todo cycles**, one stage at a time. Do **not** start the next stage until the current stage is implemented, tested, and committed. There are no separate per-stage PRD files — `NewsNexus12LiteV02_prd.md` is the single PRD, and each stage slices the section noted below.

Each stage runs the full `PLAN_AND_VET.md` loop:

> plan → plan-assessment loop → todo → todo-assessment loop → implement → test → commit

A TODO is required for every stage (all are multi-step). Skip the TODO only for trivial (~5-line) changes, per `PLAN_AND_VET.md`.

## Architecture (see docs/20260616_arch_assessment_claude.md)

- **portal** (Next.js): UI, flow state, polling, and light server routes (Google RSS fetch, OpenAI state-assignment call — server-side only).
- **worker-node** (Express): heavy/long jobs only — scraping (Playwright/Cheerio) and the two Hugging Face models — behind a `start-job` / poll interface.
- No standalone `api`, no `worker-python`, no durable queue. All pipeline data is ephemeral/in-memory. One user at a time.

## The 6 stages

| # | Stage | PRD section | Plan basename (lowercase) |
|---|-------|-------------|---------------------------|
| 1 | Foundation / portal shell | intro + table/styling | `<date>_portal_plan_v01.md` |
| 2 | Search (Google RSS) | §1 | `<date>_search_plan_v01.md` |
| 3 | Scrape (introduces worker-node + job/poll contract) | §2 | `<date>_scrape_plan_v01.md` |
| 4 | Nexus Location Rating | §3 | `<date>_location_rating_plan_v01.md` |
| 5 | State (AI Assigned) | §4 | `<date>_state_assigner_plan_v01.md` |
| 6 | Nexus Semantic Rating | §5 | `<date>_semantic_rating_plan_v01.md` |

## Required "Roadmap context" header in every plan

Every stage plan must open with a short context block so the agent builds forward-compatibly:

- This is part **N of 6**. Full sequence: Foundation → Search → Scrape → Location → State → Semantic.
- The table renders **all 7 columns** from stage 1; later stages only populate cells — do not restructure the table.
- The portal↔worker-node **job/poll abstraction is established in stage 3 and reused** by stages 4 and 6 — do not fork it per stage.
- All pipeline data is **ephemeral/in-memory** — never add durable persistence.
- Stay within this stage's scope; do not pre-build a later stage's feature.
