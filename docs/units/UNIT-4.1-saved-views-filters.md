# UNIT 4.1: Saved views & filters

- **Plan unit:** 4.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 4)
- **Status:** done
- **Requirements:** R8
- **Dependencies:** 2.11 (search) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Define, save, and apply filters as named views per board.

- `packages/domain/src/filters.ts` — the pure model + evaluator:
  - `Filter` = nestable `{op:'and'|'or', clauses:[FilterClause | FilterGroup]}`; `FilterClause`
    `{field, condition, values}` over `status/priority/severity/label/dueDate/assignee/title`.
  - `evaluateFilter(card, filter, ctx)` — side-effect-free; empty group matches all; `ctx` injects
    `now` (date windows) and `currentUserId` (the `@me` assignee sentinel).
  - `sortCards(cards, sort)` (stable, non-mutating), `SavedView`, and `PRESET_VIEWS` ("My cards",
    "Due this week", "High priority").
- `packages/sync/src/board-doc.ts` — `listViews`/`saveView`/`deleteView` (views stored as a plain
  JSON array on `meta.views`, mirroring `badgeConfig`).
- `packages/commands` — `saveView`/`deleteView` commands (recursive zod schema for the filter tree
  via `z.lazy`), registered in the catalog so views are agent-native too.
- `apps/web`: `lib/use-views.ts` (`useSavedViews`, `useViewActions`), `components/board/views.tsx`
  (preset + saved-view chips, save-as-view, delete), `filter-builder.tsx` (add/edit AND clauses with
  field-appropriate value editors). Wired through `MainArea` → `BoardView` → `ColumnCards`, which
  applies `evaluateFilter` to each column (and the Unsorted lane); the active view resets on board
  switch.
- Tests: `packages/domain/src/filters.test.ts`.

## Why (decisions)

- **Pure, nestable model in the domain.** Evaluation is a side-effect-free function over
  `(card, filter, ctx)`, so the same filter runs on any client and is exhaustively unit-testable
  (and/or/nesting, every condition, date windows, `@me`). This is the DoD's core.
- **`ctx` injects `now`/`currentUserId`.** Keeps date math and "my cards" deterministic/testable
  rather than reaching for globals.
- **Deleted labels degrade gracefully.** A clause referencing a removed label id simply matches no
  card (the evaluator checks `card.labelIds`, never a label registry) — no crash (tested).
- **Views persisted via the command layer.** Saving a view mutates the board doc, so it goes through
  `saveView`/`deleteView` commands (CLAUDE.md §3), which also exposes them over REST/MCP. The filter
  tree is validated with a recursive `z.lazy` schema at that boundary.
- **Client-side filtering of the rendered cards.** Filtering is a pure projection over the live card
  list — no separate query path, and it composes with sync (filter re-applies as cards change).
- **Builder is AND-of-clauses; the model is richer.** The UI covers the common case (a flat AND);
  OR/nesting is fully supported and tested in the model, ready for a more advanced builder later.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit:** `pnpm --filter @boardly/domain test` — `filters.test.ts`: empty→all; `priority=High AND
label=bug`; OR + nested groups; `isSet`/`isEmpty`; `hasAny`/`hasAll`; dueDate windows
  (overdue/today/week); title contains (case-insensitive); `@me` assignee; **deleted-label id →
  no-match, no throw**; `sortCards` (priority desc, dueDate asc undated-last, non-mutating); the
  high-priority preset. 42 domain tests pass.
- **e2e (Playwright, dark, server + build):** created a board with 4 cards; opened **Filter** →
  added `Title contains "bug"` → only the two bug cards remained (header shows "Filtered"); **saved
  it as a view "Bugs"** which then appears alongside the presets and re-applies. Screenshot:
  `docs/units/screenshots/UNIT-4.1-filters-dark.png`.
- **Gates:** `pnpm -r typecheck` (8/8), `pnpm -r lint` (8/8), `pnpm -r test` (domain 42 / web 92 /
  …), `pnpm --filter @boardly/web build`, `pnpm format:check` — all green.

## Follow-ups / known gaps

- **Sort + groupBy in the UI**: `sortCards` and the `sort`/`groupBy` view fields exist and are
  persisted, but the board UI applies **filter only** for now; `groupBy` renders swimlanes in
  **Unit 4.2**, and applying `sort` in the board view can land alongside it.
- **Column header counts** show the unfiltered total; making them reflect the active filter is a
  small follow-up.
- **Builder is AND-only**; an OR/nested-group builder can be added on top of the (already capable)
  model when needed.
