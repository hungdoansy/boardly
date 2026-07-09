# UNIT 1.4: Columns UI (create / rename / reorder / delete)

- **Plan unit:** 1.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R5 (core board)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-1.4-columns-dark.png`

## What changed

Render and manage a board's columns.

- `apps/web/lib/use-board.ts` — board-scoped hooks: `useColumns` (live ord-sorted columns via `useY`
  on the columns map), `useCardCounts` + `useReclaimedCards` (via the new `useYDoc`, since they span
  columns **and** cards), and `useColumnActions` (add/rename/remove — **all via the command layer**:
  `addColumn`, `renameColumn`, `archiveColumn`).
- `apps/web/components/board/column.tsx` — `BoardColumn`: 300px surface with a header (inline-rename
  on double-click, card count, hover delete) and a scrollable body that will hold cards (Unit 1.5).
- `apps/web/components/board/add-column.tsx` — `AddColumn`: dashed trailing affordance that expands
  to an inline name input (Enter to create, Esc/blur to cancel).
- `apps/web/components/board/board-view.tsx` — `BoardView`: horizontal, ord-ordered columns + an
  **"Unsorted"** bucket (shown only when `reclaimCards` is non-empty) + the add-column affordance.
- `apps/web/components/app/workspace-app.tsx` — the main area now renders `<BoardView>` for the
  selected board (replacing the 1.3 placeholder).
- `packages/sync` — added `useYDoc(doc, selector)` to `@boardly/sync/react`: a doc-level
  subscription for selectors that depend on multiple top-level Y types.
- Test: `apps/web/components/board/column.test.tsx`.

## Why (decisions)

- **`useYDoc` for cross-type selectors.** Archiving a column mutates the _columns_ map, but it changes
  which cards are "reclaimed" (a function of columns **and** cards). A scoped `useY(boardCards…)`
  observer would miss the column change and leave the "Unsorted" bucket stale. `useYDoc` subscribes to
  the doc's `update` event so any change recomputes — while `useColumns` stays scoped to the columns
  map for cheap, targeted updates. (This was caught by the delete-with-cards test failing first.)
- **Delete = soft-delete + reclaim, never data loss.** `archiveColumn` doesn't touch the cards; the
  board surfaces orphaned cards in the "Unsorted" bucket (via `reclaimCards`), matching the sync-layer
  contract from Unit 1.1.
- **All mutations through the command layer** (agent parity, R13) — the UI never calls sync mutators.
- **Add-column commits on Enter, cancels on blur/Esc** — deterministic (avoids the Enter+blur
  double-commit race); a follow-up could switch to blur-commit if desired.

## Design (per DESIGN.md)

- Columns are `--bg-surface` cards with `--border-subtle`, 300px wide, dense 9-unit headers
  (`text-md` medium title, `text-xs` tabular count). Delete affordance fades in on hover
  (`opacity`/`--dur-fast`); inline inputs use the accent ring. The add-column affordance is a dashed
  outline that brightens on hover. Board scrolls horizontally; one accent, all tokens.
- Dark screenshot: `docs/units/screenshots/UNIT-1.4-columns-dark.png` (board "Product" with the three
  default columns + Add column).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test`
(8 total; 4 new):

- Zero columns → the add-column affordance shows (no column regions).
- Add columns → they appear and persist in **ord order** (asserted against the doc).
- Rename a column inline.
- **Delete a column that has a card → the column is gone, the card is in `reclaimCards`, and the
  "Unsorted" bucket renders** (card not lost).

Full gates: `pnpm turbo run typecheck` (7/7), `lint` (7/7), `test` (domain 15 / sync 16 / commands 4 /
ui 2 / web 8), `pnpm --filter @boardly/web build` (static export valid), `format:check` clean.
Dark Playwright screenshot reviewed vs DESIGN.md.

## Follow-ups / known gaps

- **Column bodies are empty** — card faces + the add-card composer land in Unit 1.5; counts already
  reflect real cards once they exist.
- **Column reordering** (drag) is Unit 1.6; the `moveColumn` command already exists.
- The "Unsorted" bucket lists a count + note now; it renders the actual reclaimed card faces once the
  card component exists (1.5).
