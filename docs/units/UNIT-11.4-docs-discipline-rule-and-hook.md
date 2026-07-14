# UNIT 11.4: Docs-discipline rule + soft pre-commit warning hook

- **Plan unit:** Unit 4 (`docs/plans/2026-07-14-002-feat-ui-docs-improvements-batch-plan.md`)
- **Status:** done
- **Requirements:** R6
- **Commit(s):** _this commit_

## What changed

- **Written rule sharpened** in `CLAUDE.md` §1 and `AGENTS.md`: an explicit **same-commit rule** — any commit touching product source (`apps/**`, `packages/**/src`, `**/src-tauri/**`) must stage a doc surface in the same commit (a `docs/units/UNIT-<id>-*.md`, `docs/design/DESIGN.md`, or `docs/plans/*` / `PLAN.md`), with a checklist calling out the historically-missed cases (icon/glyph swaps, focus-ring/tab-order, badge/token tweaks, new reusable primitives) and the convention to cite `UNIT-<id>` in the subject.
- **New tooling (the repo's first git-hook mechanism):**
  - `scripts/check-docs-touched.mjs` — a warn-only guard with an exported pure `classify()` core. Reads `git diff --cached` and prints a yellow reminder when source is staged with no doc surface. **Always exits 0** — never blocks.
  - `.husky/pre-commit` — runs `lint-staged` then the guard.
  - `package.json` — added `husky@9.1.7` and `lint-staged@17.0.8` (exact-pinned, §4), a `"prepare": "husky"` script, and a `lint-staged` config that runs `prettier --write` on staged files only.
  - `vitest.config.ts` — added a `scripts` project so the guard's tests run in the root suite.
  - `scripts/check-docs-touched.test.mjs` — 8 classifier tests.

## Why (decisions)

- The last-50-commit audit found ~86% doc compliance with a recurring leak: visual/spec changes (icon swaps, status-column reorder, "soon"-tier removal, sidebar glyph, focus-ring/tab-order) shipped with no unit-doc/DESIGN update. The rule existed but had no commit-time reinforcement.
- **Warn, never block** (chosen by the user). Matches the repo's low-friction, commit-per-unit culture and the "whenever possible" framing. A blocking gate would have false-flagged legitimate one-liners; the warn tier surfaces every historical gap without stopping anyone. Exit code is unconditionally 0.
- **lint-staged bundled in** because the hook is the natural home to enforce the existing "only prettier your own touched files, never `prettier --write .`" rule (repo memory `boardly-gate-drift`): staged-only formatting, and `pnpm-lock.yaml` is already in `.prettierignore` so the lockfile is never reformatted.
- **`docs/**` + `PLAN.md` are the doc surfaces** (DESIGN.md and unit docs both live under `docs/`). Source excludes the `apps/e2e/**` app, `*.test.*`/`*.spec.*`, and markdown.
- **`execFileSync` (argument array, no shell)** for the git call — no interpolation, no injection surface.
- **Classifier exported + unit-tested** so the logic is verified without needing a real git repo; the thin `main()` only wires stdin/exit.

## How it works

- husky sets `core.hooksPath=.husky/_` via the `prepare` script (runs on `pnpm install`). On commit, `.husky/pre-commit` runs `lint-staged` (formats staged files) then `node scripts/check-docs-touched.mjs`.
- `classify(files)` → `{ sourceFiles, docTouched, shouldWarn }`; `shouldWarn` is true only when ≥1 source file is staged and no doc surface is. The guard prints the reminder to stderr and exits 0.
- `husky` no-ops outside a git repo (its documented v9 behavior), so a filtered/CI/Docker `pnpm install` without `.git` won't fail on `prepare`.

## How to test / verify

- Unit tests (`scripts/check-docs-touched.test.mjs`, 8 passing): source-only → warn; source+unit-doc → no warn; DESIGN.md and PLAN.md count as doc surfaces; docs-only → no warn; test/spec/e2e excluded from source; `src-tauri` Rust counts as source; root config/scripts are not source. Run: `pnpm exec vitest run --project scripts`.
- Runtime: verified the warn path fires for a staged source file and the process exits 0; verified `pnpm-lock.yaml` is prettier-ignored.
- Full suite green: `pnpm exec vitest run` → 486 passed / 37 skipped. `eslint`/`prettier` clean on the touched files.
- This very commit exercises the hook (lint-staged + guard) end-to-end.

## Follow-ups / known gaps

- The `scripts` vitest project runs under the root `pnpm exec vitest run`, but not under `pnpm test` (turbo runs per-workspace `test` scripts and `scripts/` is not a workspace). Acceptable for a personal repo; promoting `scripts/` to a workspace would wire it into turbo if ever wanted.
- Recommend a quick check that the prod Docker install (`docker-compose.prod.yml`, see `boardly-local-production`) still installs cleanly with the new root `prepare` script (expected fine — husky no-ops without `.git`).
- The rule intentionally stays a warning; escalate to a blocking tier or a CI mirror only if the leak recurs.
