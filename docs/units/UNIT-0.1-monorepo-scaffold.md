# UNIT 0.1: Monorepo scaffold

- **Plan unit:** 0.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 0)
- **Status:** done
- **Requirements:** R4 (two platforms, one codebase)
- **Commit(s):** _this unit's commit_

## What changed

Created the pnpm + Turborepo workspace skeleton with the Node toolchain pinned and every
package/app wired into one typecheck/build graph.

Root files:

- `package.json` — private workspace root. `packageManager: pnpm@11.1.3`, `engines.node >= 22.17.1`,
  `type: module`. Scripts delegate to Turbo (`build`/`lint`/`typecheck`/`test`) plus `format` /
  `format:check` via Prettier. Dev deps pinned **exactly**: `turbo 2.10.4`, `typescript 5.9.3`,
  `@types/node 22.20.1`, `prettier 3.9.4`.
- `pnpm-workspace.yaml` — globs `packages/*` and `apps/*`.
- `turbo.json` — task graph. `build`/`typecheck`/`lint`/`test` each `dependsOn: ["^build"]` so a
  package's dependencies are built before it is checked; `build` outputs cover `dist/`, `.next/`,
  `out/`; `test` outputs `coverage/`.
- `.nvmrc` — `22.17.1`.
- `tsconfig.base.json` — strict TS base (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `moduleResolution: Bundler`, `isolatedModules`, declaration + source maps). Every package extends it.
- `.gitignore` — node_modules, build outputs, `.turbo`, coverage, Playwright reports, Rust/Tauri
  `target/`, env files (keeps `.env.example`), editor/OS noise.

Workspace stubs (each: `package.json`, `tsconfig.json` extending the base, placeholder `src/index.ts`):

- `packages/domain` → `@boardly/domain`
- `packages/sync` → `@boardly/sync` (declares `@boardly/domain: workspace:*` to exercise the graph edge)
- `packages/ui` → `@boardly/ui`
- `apps/web` → `@boardly/web`
- `apps/server` → `@boardly/server`
- `apps/e2e` → `@boardly/e2e`

`pnpm-lock.yaml` committed.

## Why (decisions)

- **pnpm workspaces + Turborepo** per the plan's Key Technical Decisions — pnpm for strict, fast
  installs and workspace protocol; Turbo for a cached task graph across packages/apps.
- **Exact version pins (no `^`/`~`)** per CLAUDE.md §4. `packageManager` pins pnpm so every
  contributor/agent resolves identically.
- **TypeScript `5.9.3`, not the newer `6.0.3`.** 5.9.x is the version the surrounding ecosystem
  (typescript-eslint, Next 16's `TS ≥ 5.1` requirement, RTL) is proven against; 6.0.x is bleeding
  edge and risks tooling breakage during an autonomous loop. 5.9.3 satisfies every stated constraint.
- **`@types/node` pinned to `22.20.1`** (the Node 22 line) rather than the `26.x` default, to match
  the pinned runtime.
- **Package `exports` point at `src/index.ts`** (TS source, not built `dist`). Internal packages are
  consumed as source by the bundlers (Next/Vite) and by `tsc` in-graph, so no pre-build step is
  needed to develop against them. `tsc --noEmit` per package still validates each in isolation.
- **`dependsOn: ["^build"]` on `typecheck`** guarantees turbo resolves and orders the workspace
  graph (proven by `@boardly/domain:build` running before `@boardly/sync:typecheck`).

## How it works

`pnpm install` links the six workspace projects via the workspace protocol. `turbo run <task>`
reads `turbo.json`, computes the dependency-ordered task graph from each `package.json`'s deps, and
runs the matching script per package with caching. The single `@boardly/sync → @boardly/domain`
edge demonstrates cross-package resolution works end-to-end.

## Design (UI units)

N/A — no UI in this unit. Theme tokens and shadcn/ui arrive in Unit 0.4.

## How to test / verify

No runtime logic → no unit tests (per the plan: "scaffolding/config"). Verified by build/graph
outcomes. All commands must be prefixed with the pinned toolchain
(`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`) — the machine default node is not 22.

- `pnpm install` — succeeds under Node 22.17.1, resolves all 7 workspace projects.
- `pnpm turbo run typecheck` — **7 tasks successful** (6 typecheck + `@boardly/domain:build` pulled
  in as a `^build` dependency of `@boardly/sync`), no missing-reference errors.
- `pnpm turbo run build` — **6 tasks successful**.

Lint and test harness are intentionally deferred to Unit 0.2; no `lint`/`test` scripts exist yet,
so those turbo tasks are no-ops until then.

## Follow-ups / known gaps

- **Unit 0.2** adds ESLint (flat config), Prettier config + `.prettierignore` (pre-existing docs and
  `pnpm-lock.yaml` are currently unformatted and were left untouched), and the Vitest root with
  `test.projects`.
- `apps/web` / `apps/server` / `apps/e2e` are placeholder TS packages; they are replaced by the real
  Next.js (0.4), Fastify (3.1), and Playwright (5.4) scaffolds in their units.
