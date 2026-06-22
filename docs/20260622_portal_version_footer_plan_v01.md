---
created_at: 2026-06-22
updated_at: 2026-06-22
created_by: claude (opus-4.8)
modified_by: claude (opus-4.8)
---

# Plan: portal version footer (git-derived) + npm workspace migration

## Context

The app should show a small `version ###` in the footer of every page. The version must be
**derived from git** — not a manually maintained number — using commit counts:

```
version {main_count}.{branch_count}
  main_count   = commits on main as of the point where HEAD branched off
  branch_count = commits made on the current branch since branching (0 when on main)
```

Validated against the repo: on `main` today this yields `version 55.0`. The scheme falls out
of `git merge-base`:

```
main_count   = git rev-list --count $(git merge-base HEAD main)
branch_count = git rev-list --count $(git merge-base HEAD main)..HEAD
```

On `main`, merge-base == HEAD → branch_count is `0`. On a feature branch, main_count freezes at
the branch point and branch_count rises per commit (e.g. `version 55.3`).

**Why this is "comprehensive":** the single root `.git` tracks the whole monorepo, so a commit
touching `portal/`, `worker-node/`, or `docs/` all increment the same count. Comprehensiveness
comes from git, not the build system. Nothing is stored or "incremented" by us — git is the
counter and we just read it at build time.

**Key constraint:** a deployed Next.js build is a compiled bundle with no `.git` at runtime, so
the version must be computed at **build / dev-server-startup time** and baked into the bundle.

**Decisions confirmed with the operator:**
- Fallback when git/`main` is unavailable → show `version dev`.
- Migrate to npm workspaces (for single-command install/build). The repo has **no CI, Docker, or
  deploy scripts**, so this migration is low-risk and leaves app code untouched.

## Current state (verified)

- No root `package.json`. Two packages: `portal/` (Next.js 16, App Router, React 19) and
  `worker-node/` (Express, tsx). Separate lockfiles `portal/package-lock.json`,
  `worker-node/package-lock.json`.
- Root layout: `portal/src/app/layout.tsx` — wraps children; **no footer exists yet**.
- `portal/next.config.ts` is minimal (`reactStrictMode: true`); no env injection today.
- Local `main` and `origin/main` both exist.
- No version is displayed anywhere; `portal/package.json` has an unused `"version": "0.1.0"`.

## Technology / approach

- **Git** for the version source (`git merge-base`, `git rev-list --count`), read at build time.
- **npm workspaces** for single-command install/build from the repo root.
- **Next.js build-time env injection** (`next.config.ts` `env` field → `NEXT_PUBLIC_APP_VERSION`)
  so the computed string is inlined into the bundle and readable by the client footer.
- A **single shared Node script** at the repo root holds the git logic (one source of truth),
  callable by either app.

## Step 1 — npm workspace migration

1. Add root `package.json`:
   - `"private": true`, `"workspaces": ["portal", "worker-node"]`.
   - Convenience scripts that fan out, e.g. `"build": "npm run build --workspaces --if-present"`,
     plus targeted `"dev:portal": "npm run dev -w portal"`,
     `"dev:worker": "npm run dev -w worker-node"`, and `lint`/`test` across workspaces.
2. Delete `portal/package-lock.json` and `worker-node/package-lock.json`; run one root
   `npm install` to produce a single hoisted `node_modules` + one root `package-lock.json`.
3. Confirm `.gitignore` ignores root `node_modules` (it already ignores `.next`/`dist`).
4. `.env.local` files stay in their packages (workspaces do not move them).
5. Smoke-test: `npm run build` from root builds both; each app still starts.
6. Optionally note the new root commands in `AGENTS.md`.

## Step 2 — shared version script (single source of truth)

Add `scripts/appVersion.mjs` at the repo root. A small module that:
- Runs the two `git rev-list --count` commands via `child_process` (the root `.git` is found
  even when invoked from `portal/`).
- Returns the string `"{main_count}.{branch_count}"`.
- Is wrapped in try/catch: if git fails, `main` is absent, or `.git` is missing → return
  `"dev"` (so the footer shows `version dev`).

This is the only copy of the git logic; both apps can call it.

## Step 3 — inject into the portal at build time

In `portal/next.config.ts`:
- Call `../scripts/appVersion.mjs` during config evaluation (runs at `next dev` start and
  `next build`).
- Set `env: { NEXT_PUBLIC_APP_VERSION: <computed string> }` so the value is inlined into the
  bundle and readable on the client.

## Step 4 — footer on every page

- New `portal/src/components/layout/Footer.tsx`: a small, theme-aware footer rendering
  `version {process.env.NEXT_PUBLIC_APP_VERSION}` (small, muted text; respects the dark theme
  and the existing `.stage-aligned-region` padding pattern in `portal/src/app/globals.css`).
- Render `<Footer />` in `portal/src/app/layout.tsx` so it appears under every route.

## Optional follow-on (out of scope for the footer)

`worker-node` can expose the same version (e.g. a `version` field on a status endpoint) by
calling the same `scripts/appVersion.mjs` — only if a backend-reported version is wanted later.

## Files to create / modify

- **Create** `package.json` (root, workspaces)
- **Create** `scripts/appVersion.mjs`
- **Create** `portal/src/components/layout/Footer.tsx`
- **Modify** `portal/next.config.ts` (env injection)
- **Modify** `portal/src/app/layout.tsx` (render footer)
- **Delete** `portal/package-lock.json`, `worker-node/package-lock.json` (replaced by root lockfile)

## Verification

1. **Git logic:** run the two commands on `main` → expect `55` / `0`. Check out a feature
   branch, add a commit, re-run → main_count stays `55`, branch_count becomes `1` → `version 55.1`.
2. **Fallback:** run the script where `main`/`git` is unavailable → returns `"dev"`.
3. **Workspace:** from repo root, `npm install` then `npm run build` builds both packages; each
   app still starts via its dev/start script.
4. **UI:** `npm run dev -w portal`, load any page, confirm the footer shows `version 55.0`
   (or the current count) on every route and reads well in dark mode.

## Notes for the assessing agent

- The npm workspace migration is bundled here because the operator wants single-command
  install/build and it makes the version always-fresh on a root build. It could be split into its
  own plan if preferred — flag if you think the scope warrants separation.
- Confirm `portal/next.config.ts` importing a sibling `../scripts/appVersion.mjs` is acceptable
  under the project's module conventions, and that `NEXT_PUBLIC_` inlining is the intended
  exposure path vs. a server-component read.
