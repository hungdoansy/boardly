# UNIT 1.6: Drag-and-drop (cards + columns, keyboard-accessible)

- **Plan unit:** 1.6 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R2 (performant), R5 (core board), R8 (keyboard-first)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-1.6-dnd-dark.png`

## What changed

Move cards within/across columns and reorder columns, by pointer **and** keyboard.

- `apps/web/lib/dnd.ts` — the **pure** drop→ord computation (no dnd-kit/React): `neighborsInList`,
  `reorder` (within-list arrayMove + cross-list insert), `sameNeighbors`, and `planMove` (returns
  post-move `{afterId, beforeId}`, or `null` when the item lands on its current position — no `ord`
  churn). Unit-tested in `dnd.test.ts`.
- `apps/web/components/board/dnd.tsx` — `BoardDndProvider` (DndContext + Pointer/Keyboard sensors +
  `closestCorners` + `DragOverlay`), `SortableCard`, `SortableColumn`. `onDragEnd` reads the current
  order from the board doc, calls `planMove`, and dispatches `moveCard` / `moveColumn` **via the
  command layer**.
- `apps/web/components/board/column.tsx` — `BoardColumn` gains dnd props (`dndRef`, `dndStyle`, and a
  header **grip handle** that carries the sortable attributes/listeners, so a column is dragged by
  its handle, not by clicking its title/cards).
- `apps/web/components/board/column-cards.tsx` — cards wrapped in a vertical `SortableContext` of
  `SortableCard`s.
- `apps/web/components/board/board-view.tsx` — columns wrapped in a horizontal `SortableContext` of
  `SortableColumn`s, all inside `BoardDndProvider`.
- Deps: `@dnd-kit/core 6.3.1`, `@dnd-kit/sortable 10.0.0`, `@dnd-kit/utilities 3.2.2`.

## Why (decisions)

- **Pure ord computation, separated from dnd-kit.** jsdom can't do real drag, so the risky
  arithmetic (neighbors, boundaries, no-op) is a pure module with exhaustive unit tests; the wiring
  is verified in Playwright (the plan's execution note).
- **A move = neighbors → one `ord` write.** `onDragEnd` computes the post-move ordered id list
  (dnd-kit gives `active`/`over`), derives `{afterId, beforeId}`, and calls the existing
  `moveCard`/`moveColumn` commands — so drag reuses the exact agent-parity write path (R13), and the
  Yjs write is instant/optimistic.
- **No-op guard** (`planMove` returns `null`) prevents dropping a card onto its own position from
  churning the fractional key.
- **Columns drag by a handle, cards drag by the body.** Pointer activation distance (5px) means a
  click (archive, inline-edit, add-card) never starts a drag; the column grip avoids hijacking
  header clicks.
- **Keyboard-first (R8).** `KeyboardSensor` + `sortableKeyboardCoordinates`; the sortable wrappers
  are focusable (`role=button`, `tabIndex=0`) so Space picks up, arrows move, Space drops — verified
  live.
- **`onDragEnd` reads order from the doc**, not from React state threaded through the tree — the
  selectors (`cardsInColumn`/`liveColumns`) are the single source of truth.

## Design (per DESIGN.md)

- Drag feedback is lightweight: the source dims (`opacity` 0.4 card / 0.5 column) and a `DragOverlay`
  shows a compact preview with the drop shadow token; drop settles instantly (no layout animation on
  the list — DESIGN §6). Column grip + card focus use the accent `focus-visible` ring. All tokens.
- Dark screenshot: `docs/units/screenshots/UNIT-1.6-dnd-dark.png` (both cards moved into Doing;
  keyboard focus ring visible on the moved card).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/web test`
(25 total; 12 new in `dnd.test.ts`):

- `neighborsInList` — surrounding ids; null at start/end; single item.
- `reorder` — within-container move; cross-container insert-before-over; append on empty column.
- `planMove` — cross-column neighbors; within-column reorder; **no-op on same position**; append to
  empty column.

**Critical flow (Playwright, dark):** served `out/` →

- **Pointer** drag "Draggable card" To Do → Doing → it moves; **reload → the move persists**
  (offline IndexedDB).
- **Keyboard** drag (focus card, Space, ArrowRight, Space) moves "Stays put" To Do → Doing.
- Screenshot reviewed vs DESIGN.md.

Full gates: `pnpm turbo run typecheck` (7/7), `lint` (7/7), `test` (domain 15 / sync 16 / commands 4 /
ui 2 / web 25), `pnpm --filter @boardly/web build` (static export valid), `format:check` clean.

## Follow-ups / known gaps

- **Cross-column drop position within a populated destination** uses "insert before the over card";
  fine-grained above/below-midpoint placement can be tuned later if needed.
- **Virtualization** for very long lists (R2) is still deferred; drag performance is smooth at
  current volumes.
- Auto-scroll while dragging near board edges is dnd-kit's default; not customized.
