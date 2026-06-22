---
created_at: 2026-06-22
updated_at: 2026-06-22
created_by: claude (opus-4.8)
modified_by: codex (gpt-5)
---

# Todo: portal version footer (git-derived) + npm workspace migration

Derived from `20260622_portal_version_footer_plan_v01.md`. Implements a git-derived
`version {main_count}.{branch_count}` indicator shown in the footer of every page, plus the
npm workspace migration that enables single-command install/build.

**End of every phase (where infrastructure exists):**

1. Run type-check / lint (`npm run type-check`, `npm run lint` in the affected package(s)).
2. Run tests (`npm run test`).
3. Attempt a build (`npm run build`).
4. If anything fails, fix the code so functionality is preserved and checks pass.
5. Check off the completed tasks and commit (per `AGENTS.md` commit guidance, with the
   `co-authored-by` line).

---

## Phase 1 — npm workspace migration

- [x] Create a root `package.json` with `"private": true` and
      `"workspaces": ["portal", "worker-node"]`.
- [x] Add root convenience scripts: `build` (`npm run build --workspaces --if-present`),
      `dev:portal` (`npm run dev -w portal`), `dev:worker` (`npm run dev -w worker-node`),
      and `lint` / `test` fanned across workspaces.
- [x] Delete `portal/package-lock.json` and `worker-node/package-lock.json`.
- [x] Run a single root `npm install` to produce one hoisted `node_modules` and one root
      `package-lock.json`.
- [x] Confirm `.gitignore` ignores root `node_modules`; leave each package's `.env.local` in place.
- [x] Smoke-test: `npm run build` at root builds both packages; `npm run dev:portal` starts
      cleanly; `npm run dev:worker` listens on port 3000 and exposes the existing location
      classifier warm-up issue in TS watch mode.
- [ ] (Optional) Note the new root commands in `AGENTS.md`.
- [x] End-of-phase checks (type/lint/test/build), then check off and commit.

## Phase 2 — shared version script (single source of truth)

- [x] Create `scripts/appVersion.mjs` at the repo root.
- [x] Implement the git logic with `child_process`:
      `main_count = git rev-list --count $(git merge-base HEAD main)`,
      `branch_count = git rev-list --count $(git merge-base HEAD main)..HEAD`,
      returning the string `"{main_count}.{branch_count}"`.
- [x] Wrap in try/catch: on any failure (git missing, `.git` absent, no `main`), return `"dev"`.
- [x] Verify from `portal/` the root `.git` is still found (run the script with cwd = `portal/`).
- [x] End-of-phase checks (no test infra for a standalone script — at minimum run the script and
      confirm it prints the current branch-aware `{main_count}.{branch_count}`), then check off
      and commit.

## Phase 3 — portal build-time injection

- [ ] In `portal/next.config.ts`, call `../scripts/appVersion.mjs` during config evaluation
      (runs at `next dev` start and `next build`).
- [ ] Set `env: { NEXT_PUBLIC_APP_VERSION: <computed string> }` so the value is inlined into the
      bundle and readable on the client.
- [ ] Confirm importing a sibling module outside `portal/` works under the project's config; if
      not, shell out to the script from within `next.config.ts` instead.
- [ ] End-of-phase checks (type/lint/test/build for portal); confirm
      `process.env.NEXT_PUBLIC_APP_VERSION` resolves at runtime. Check off and commit.

## Phase 4 — footer component and placement

**Placement decision (best judgment):** the footer lives **inside `SlideStage`**, pinned to the
bottom of the stage card — NOT in the root layout. Rationale: `.slide-stage-shell` is
`min-height: 100vh` with only a thin animated gradient border outside it, so a root-layout footer
would fall off-screen or into the border band. `TopBar` already lives inside
`slide-stage__content`, so a footer there gives natural header/footer symmetry and shares the same
per-stage parallax. Putting it in the `SlideStage` component (not `page.tsx`) means every page
using `SlideStage` gets it automatically.

- [ ] Create `portal/src/components/layout/Footer.tsx`: small, muted, theme-aware text rendering
      `version {process.env.NEXT_PUBLIC_APP_VERSION}`; apply the `.stage-aligned-region` class for
      horizontal alignment; add a divider / top spacing above it.
- [ ] In `portal/src/components/layout/SlideStage.tsx`, wrap `{children}` in a `flex: 1` div and
      render `<Footer />` as its sibling inside `slide-stage__content`, so the footer anchors to
      the bottom of the full-height card.
- [ ] In `portal/src/app/globals.css`, make `.slide-stage__content` a flex column
      (`display: flex; flex-direction: column;`) and give the children wrapper `flex: 1 1 auto`.
      Keep exactly two flex items (content wrapper + footer) so existing children's internal
      layout is untouched.
- [ ] Verify existing content (TopBar, FlowIndicatorBar, StageActionArea, ArticlesTable, editor
      slots) still stacks and spaces correctly after the flex change; confirm the footer sits at
      the bottom of the card in dark mode and that the per-stage parallax still reads naturally.
- [ ] End-of-phase checks (type/lint/test/build for portal). Check off and commit.

---

## Final verification (end-to-end)

1. **Git logic:** on `main`, the script returns the current `{main_count}.0`. Create a feature
   branch, add a commit, re-run → main_count stays anchored to the branch point and branch_count
   becomes `1` → `version {main_count}.1`.
2. **Fallback:** run where `main`/`git` is unavailable → returns `"dev"`; footer shows `version dev`.
3. **Workspace:** from repo root, `npm install` then `npm run build` builds both packages; each app
   still starts via its dev/start script.
4. **UI:** `npm run dev:portal`, load the page, confirm the footer shows
   `version {main_count}.0` on `main`, is anchored to the bottom of the stage card, aligned with
   other regions, and reads well in dark mode.
