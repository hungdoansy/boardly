# UNIT 0.2: Shared lint / format / test harness

- **Plan unit:** 0.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 0)
- **Status:** done
- **Requirements:** R12 (quality bar)
- **Commit(s):** _this unit's commit_

## What changed

One ESLint (flat config) + Prettier setup and one Vitest root using `test.projects`, wired into the
Turbo task graph.

Created:

- `eslint.config.mjs` — flat config: `@eslint/js` recommended + `typescript-eslint` recommended
  (non-type-checked, so no per-package `parserOptions.project` is needed → fast, robust). Node +
  browser globals on `**/*.{ts,tsx}`; `no-unused-vars` tuned to allow `_`-prefixed names; a
  `react-hooks` block (`rules-of-hooks: error`, `exhaustive-deps: warn`) scoped to `**/*.{tsx,jsx}`;
  `eslint-config-prettier` **last** to disable stylistic rules that fight Prettier. Build/output dirs
  and `node_modules` ignored.
- `.prettierrc` — `semi`, double quotes, `trailingComma: all`, `printWidth: 100`.
- `.prettierignore` — `pnpm-lock.yaml` + build/output/`node_modules` globs.
- `vitest.config.ts` (root) — `test.projects: ["packages/domain","packages/sync","packages/ui"]`.
  Running `vitest run` at the root executes the whole suite; each project also runs independently
  under Turbo.
- `packages/{domain,sync,ui}/vitest.config.ts` — per-project configs via `defineProject`.
  `domain` = node; `sync` = node + shared setup (fake-indexeddb, ready for Unit 1.2); `ui` = jsdom +
  `@vitejs/plugin-react` + shared setup. All use `vite-tsconfig-paths`.
- `vitest.setup.ts` (root) — imports `@testing-library/jest-dom/vitest` and `fake-indexeddb/auto`;
  referenced by the sync + ui projects via a `fileURLToPath(new URL(...))` absolute path.
- Sample tests: `packages/domain/src/index.test.ts` (node smoke check) and
  `packages/ui/src/env.test.ts` (asserts jsdom `document` + fake-indexeddb `indexedDB` are present).

Modified:

- Root `package.json` — added the exact-pinned dev tooling (see below) and `format` / `format:check`
  scripts (already present from 0.1).
- Each workspace `package.json` — added `lint: "eslint ."`; the three test-bearing packages also got
  `test: "vitest run --passWithNoTests"`.
- `packages/ui/tsconfig.json` — added `lib: ["ES2023","DOM","DOM.Iterable"]` (the ui env test uses
  DOM globals).
- `turbo.json` — dropped the unused `coverage/**` output on the `test` task (silences a
  "no output files" warning; coverage is opt-in via `@vitest/coverage-v8`).
- **Repo-wide Prettier pass** — `prettier --write .` normalized the pre-existing planning docs and
  configs to the new standard (prose is not rewrapped: Prettier's `proseWrap` defaults to
  `preserve`, so Markdown changes are whitespace/code-fence only).

Deps pinned exactly (root `devDependencies`): `eslint 10.6.0`, `@eslint/js 10.0.1`,
`typescript-eslint 8.63.0`, `globals 17.7.0`, `eslint-config-prettier 10.1.8`,
`eslint-plugin-react-hooks 7.1.1`, `vitest 4.1.10`, `@vitest/coverage-v8 4.1.10`,
`@vitejs/plugin-react 6.0.3`, `vite-tsconfig-paths 6.1.1`, `@testing-library/jest-dom 6.9.1`,
`jsdom 29.1.1`, `fake-indexeddb 6.2.5`.

## Why (decisions)

- **ESLint 10 + typescript-eslint 8.63.** Verified `typescript-eslint@8.63` declares
  `eslint: ^8.57 || ^9 || ^10` and `typescript: >=4.8.4 <6.1.0` as peers — so ESLint 10.6.0 is
  in-range and the TS 5.9.3 pin from Unit 0.1 fits (TS 6.0 would be excluded, another reason 5.9.3
  was chosen). `eslint-plugin-react-hooks@7` also supports ESLint 10.
- **Non-type-checked lint preset.** `tseslint.configs.recommended` (not `recommendedTypeChecked`)
  avoids wiring a TS program per package and keeps lint fast/green; type errors are already caught by
  the `typecheck` task. Type-checked lint can be layered on later if wanted.
- **react-hooks rules written explicitly** rather than spreading a preset object, because the plugin's
  flat-config export shape varies across versions; two explicit rules are version-proof.
- **Tooling in root `devDependencies`.** pnpm places root-declared deps in the top-level
  `node_modules`, which every package reaches by walk-up, so per-package configs importing
  `@vitejs/plugin-react` etc. resolve without duplicating the deps in each package.
- **Per-project Vitest configs + a root aggregator.** Gives Turbo independent, cacheable `test`
  tasks _and_ a single `vitest run` for local full-suite runs — satisfying both the DoD's
  `turbo run test` and the plan's "root `test.projects`" requirement.

## Design (UI units)

N/A — no product UI yet. jsdom + jest-dom + fake-indexeddb are provisioned so later UI/Yjs units can
add component tests without re-plumbing.

## How to test / verify

Prefix every command with the pinned toolchain
(`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`).

- `pnpm turbo run typecheck` → 7/7 green.
- `pnpm turbo run lint` → 7/7 green (`eslint .` in each package).
- `pnpm turbo run test` → domain sample + ui env tests pass; sync passes with no tests yet.
- `pnpm vitest run` → 3 test files / 4 tests, one pass across all projects (proves `test.projects`).
- `pnpm format:check` → "All matched files use Prettier code style!".

## Follow-ups / known gaps

- `@testing-library/react` (RTL ≥ 16) is intentionally **not** installed yet — it has a React peer,
  and React lands with the Next.js scaffold (Unit 0.4). It joins then, alongside the first real
  component tests.
- Type-checked ESLint rules are not enabled (see rationale above).
- `vite-tsconfig-paths` prints an advisory that Vite can now resolve tsconfig paths natively; kept as
  a plugin to match the plan's stated tooling. Revisit if we adopt path aliases.
