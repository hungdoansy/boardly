# UNIT V1.1: Shared view model (`filter + sort + group + layout`)

- **Plan unit:** V1.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 6)
- **Status:** done
- **Requirements:** R15 (one view model, two lenses)
- **Dependencies:** 4.1 (filter engine), 4.2 (grouping) — both done
- **Commit(s):** _this unit's commit_

## What changed

One source of truth for "a view", so the board and the (upcoming) list lens render from the same
`{ filter, sort, groupBy, layout }` model instead of each re-implementing the pipeline.

- **`packages/domain/src/filters.ts`**
  - New `type ViewLayout = "board" | "list"`.
  - New `interface ViewLens { filter?; sort?; groupBy? }` — the lens applied to a set of cards,
    independent of how it renders.
  - New `type ResolvedView = { grouped: CardGroup[] } | { flat: Card[] }`.
  - New pure `resolveView(cards, lens, ctx): ResolvedView` — composes the existing
    `evaluateFilter` → `sortCards` → `groupCards` in that order.
  - `SavedView` gains an optional `layout?: ViewLayout` (absent → treated as `"board"`).
- **`packages/domain/src/filters.test.ts`** — added `resolveView` tests (filter→sort→group, flat
  sort, empty-lens board order, no-mutation) and a `SavedView` JSON round-trip (filter+sort+group+
  layout preserved; legacy view with no `layout` still parses).
- **`packages/commands/src/commands/view.ts`** — `viewSchema` gains `layout: z.enum(["board",
"list"]).optional()`. **Necessary beyond the plan's file list:** the schema is a `z.object`, which
  strips unknown keys, so without this the `saveView` command would silently drop `layout` and the
  real-app round-trip (V1.4) would fail even though the domain test passes.
- **`apps/web/components/board/views.tsx`** — `ActiveView` gains `sort: Sort | null` and
  `layout: ViewLayout`. Applying a saved view now restores its full lens; `saveCurrent` persists
  `sort`/`layout`; the filter/group/remove handlers preserve them via spread. (No new toolbar
  controls yet — the Board↔List switch and Sort menu are V1.4.)
- **`apps/web/components/app/workspace-app.tsx`** — the `activeView` initial state and the
  board-switch reset both seed `sort: null, layout: "board"`.

## Why

- **"One model, two lenses" (R15).** The board and list must never diverge in how they filter/sort/
  group. Putting the pipeline in a single pure `resolveView` guarantees both lenses produce the same
  ordering from the same lens; V1.3/V1.4 just choose a renderer.
- **`resolveView`, not `applyView`.** A UI handler named `applyView` already exists in `views.tsx`
  (it applies a _saved view_ to the active state). Naming the pure pipeline helper `resolveView`
  avoids a confusing same-name collision (decided with the user before implementation).
- **`layout` optional, defaults to `"board"`.** Keeps every pre-V1.1 saved view valid — an absent
  `layout` reads as board, so nothing migrates.
- **Model-only unit.** V1.1 deliberately adds no visible UI. `ActiveView` carries `sort`/`layout`
  now so the state shape is stable when V1.4 wires the controls; the board renderer is untouched.

## How it works

`resolveView(cards, { filter, sort, groupBy }, ctx)`:

1. **Filter** — if `filter` is present and non-empty, keep cards where `evaluateFilter` is true;
   otherwise pass all cards through unchanged (empty/absent filter = everything).
2. **Sort** — if `sort` is set, `sortCards` returns a stable-sorted copy; otherwise the input
   (board) order is preserved.
3. **Group** — if `groupBy` is set, return `{ grouped: groupCards(sorted, groupBy) }` (lanes are
   internally sorted because grouping runs after sorting); otherwise `{ flat: sorted }`.

The function is pure and side-effect-free (no mutation of the input array — covered by a test), so
it runs identically on any client and is fully unit-testable with an injected `now` via
`FilterContext`.

A `SavedView` is plain JSON (`filter`/`sort`/`groupBy`/`layout`/`visibleBadges`), persisted as-is by
`saveView` in `packages/sync`; the command-layer zod schema now allows `layout` through so the
persisted object keeps it.

## How to test / verify

Prereqs: Node 22.17.1 (`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`).

- **Domain unit tests:** `pnpm --filter @boardly/domain test` → **72 passed** (was 66; +6 for
  `resolveView` and the `SavedView` round-trip).
- **Gates:** `pnpm -r typecheck`, `pnpm -r lint`, `pnpm format:check` all green;
  `pnpm --filter @boardly/web build` static export compiles; `@boardly/commands` (9) and
  `@boardly/web` (117) test suites unchanged and green.
- **No e2e/screenshot:** V1.1 adds no user-facing surface (the list view + toolbar are V1.3/V1.4),
  so per the DoD it is verified by domain unit tests only.

## Follow-ups / known gaps

- The board renderer still calls `evaluateFilter`/`groupCards` via its existing props; **V1.4**
  switches board and list to both consume `resolveView` so the pipeline lives in exactly one place.
- `ActiveView.sort` and `ActiveView.layout` have no UI yet — **V1.4** adds the Sort menu and the
  Board↔List segmented switch that write them.
