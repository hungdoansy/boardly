# UNIT-9.7 — Whole-card click opens the drawer

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 9).

## What changed

Clicking anywhere on a card face now opens its detail drawer — not just the title.

- **`apps/web/components/card/card.tsx`**: `onClick={onOpen}` moved to the `<article>` root (with
  `cursor-pointer`); the inner title `<button>` collapsed to a plain `<span>` (keeping its
  `min-w-0 flex-1` sizing and terminal strikethrough styling).

## Why

- Only the title was clickable before, leaving most of the card as dead space. Making the whole
  face open the card matches Linear's behavior and the "content-first, fast" feel.
- The card face has no other interactive controls (status glyph, labels, priority, link cluster,
  and project chip are all display-only), so a single root `onClick` can't hijack a nested control.
- Keyboard open is unchanged: the focusable drag wrapper (`SortableCard`, `data-nav="card"`) is the
  roving-focus target and `keyboard-nav` opens the focused card on Enter. So the card stays fully
  keyboard-operable; the root `onClick` is a pointer affordance only (hence no `role="button"` on
  the article — the wrapper owns focus/keyboard).
- Drag safety relies on dnd-kit's `PointerSensor` 5px activation distance: a plain click (no
  movement) fires `onClick`; a real drag (>5px) is a drag, and the browser does not also dispatch a
  click on the moved element — so dragging to reorder does not open the drawer.

## How to test / verify

- **Unit tests (all green), `apps/web/components/card/card.test.tsx`:**
  - Clicking the title text opens the card (existing test, still passes via event bubbling).
  - Clicking a non-title region (the ticket id `#1`) opens the card — proves the whole face is
    clickable.
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e` DOM-lib
  break, unrelated); lint clean (exit 0); `vitest run` = 436 passed / 37 skipped; `@boardly/web`
  build compiles.

## Follow-ups / known gaps

- **Manual drag-vs-click check pending** (needs a running board): confirm that dragging a card to
  reorder does not also open the drawer, and that a stationary click does. This is the one behavior
  the jsdom tests can't exercise (no pointer-drag simulation); the 5px activation threshold is the
  mechanism. If an open-after-drag is ever observed, guard the handler with the wrapper's
  `isDragging` state.
- No visible styling change (only `cursor-pointer` + removing a transparent button wrapper), so a
  dark-mode screenshot adds little; capture opportunistically when the dev stack is up.
