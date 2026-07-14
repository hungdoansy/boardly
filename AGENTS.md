# Boardly — Agent Instructions

The authoritative repo rules live in **`CLAUDE.md`** (repo root). Read it first.

Quick summary for any coding agent working in this repo:

- Write an intensive per-unit doc in `docs/units/UNIT-<id>-<slug>.md` for every task; docs-first is welcome and must be committed before continuing.
- **Same-commit rule:** any commit touching product source (`apps/**`, `packages/**/src`, `**/src-tauri/**`) must also stage a doc surface — a `docs/units/UNIT-<id>-*.md` (feature/spec/behavior; for a fix, the owning unit's _Follow-ups_), `docs/design/DESIGN.md` (any visual/interaction/icon/token change), or `docs/plans/*` / `PLAN.md` (scope). Cite the `UNIT-<id>` in the commit subject. A husky `pre-commit` hook warns (never blocks) when source ships without docs. Don't ship-then-backfill, and don't hide code in a `docs(...)` commit.
- UI must look like **Linear**, **dark mode first**, using **shadcn/ui** primitives and the tokens in `docs/design/DESIGN.md`. Measured transitions only.
- React + frontend best practices; all mutations via the `packages/commands` command layer (agent-native parity).
- **Pin exact dependency versions** in every `package.json` (no `^`/`~`); commit the lockfile.
- Never push or create branches without explicit permission; commit locally per unit.

See `CLAUDE.md`, `PLAN.md`, `docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md`, and `docs/design/DESIGN.md`.
