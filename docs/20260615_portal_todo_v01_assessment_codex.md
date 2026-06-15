---
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: codex (gpt-5)
modified_by: codex (gpt-5)
---

# TODO Assessment — Codex

## Qualifying concern

1. Phase 5 gives conflicting placement instructions for `TopBar`.

   The TODO says `src/app/layout.tsx` should "establish the persistent top-bar frame" while the next task says `src/app/page.tsx` should compose the Top bar inside the `SlideStage` wrapper. This leaves implementation ambiguity: an agent could render the top bar twice, or put it outside `SlideStage`.

   That conflicts with the approved plan's slide behavior, where the top bar, flow indicator, and table are persistent regions inside the slide wrapper and should give the impression of sliding together. The TODO should clarify whether `layout.tsx` mounts providers only, and whether `TopBar` is rendered exactly once inside `SlideStage` with the flow indicator and table.
