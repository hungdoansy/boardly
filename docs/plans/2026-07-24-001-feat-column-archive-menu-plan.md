---
title: "feat: Column 3-dots menu — archive all cards in a column"
type: feat
status: active
date: 2026-07-24
---

# feat: Column 3-dots menu — archive all cards in a column

## Overview

Add a 3-dots ("more") menu button to each board column header. Clicking it opens a
dropdown whose only item today is **Archive all** — archiving every card currently
visible in that column, after a confirmation dialog. This gives columns a bulk action
parallel to the per-card archive already offered in the card right-click menu
(`apps/web/components/card/card-context-menu.tsx`), and establishes a reusable
click-triggered menu primitive the app currently lacks.

Owning unit doc: `docs/units/UNIT-14-column-archive-menu.md` (to be written with the work).

## Problem Frame

The board has fixed Linear-style status columns. A card can be archived one at a time
(right-click → Archive), but there is no way to clear a whole column in one gesture — a
common need when a "Done" or "Canceled" column accumulates and the user wants to sweep it
without touching each card. Columns also have no click-triggered menu surface at all
(the header exposes only the status name, live count, and an add-card "+"). This unit adds
that menu surface and its first action.

No requirements/brainstorm doc exists for this; the plan is built directly from the request
and the established column/card patterns in the codebase.

## Requirements Trace

- R1. Each column header has a 3-dots menu button that opens a dropdown menu on click.
- R2. The menu contains an **Archive all** action.
- R3. Archiving is confirmed via a dialog before it runs (mirrors the card Delete confirm).
- R4. "Archive all" archives exactly the cards **currently visible** in that column under the
  active filter — matching the header count — not cards hidden by the filter.
- R5. The bulk archive is a command-layer operation (agent-native parity — an agent can archive
  a set of cards in one call, mirroring every UI mutation).
- R6. Keyboard-operable and accessible: the trigger is a real button with an accessible name,
  the menu is a Radix menu with roving focus, Esc closes it, focus is managed.

## Scope Boundaries

- No "restore from archive" / Archive view — archived cards remain flagged-in-doc as today
  (there is still no archive-browsing UI; that is pre-existing and out of scope).
- No undo/toast-with-undo for the bulk archive (single confirmation is the guard).
- No other column menu items (rename, delete column, WIP limits, sort) — columns are fixed
  Linear statuses and cannot be renamed/removed. The menu is built to hold more items later,
  but ships with only Archive all.
- No change to the per-card archive, the add-card "+", or drag/drop behavior.

## Context & Research

### Relevant Code and Patterns

- `apps/web/components/board/column.tsx` — `BoardColumn`, the presentational column. Header
  already renders status button + count + optional add-card "+" (`onAddCard`). The menu
  button is added here alongside "+".
- `apps/web/components/board/dnd.tsx` — `StatusColumn` wraps `BoardColumn`, owns the composer
  open-state, and passes `count`/`onAddCard`. It is the natural owner of the archive action +
  confirm-dialog state, and where `visibleCardIds` is threaded in.
- `apps/web/components/board/board-view.tsx` — computes filter-aware per-status `counts` via
  `countByStatus(allCards, filter, filterCtx)` and renders `StatusColumn`. This is where the
  matching per-status **visible card id list** is derived and threaded down.
- `apps/web/components/board/column-cards.tsx` — the source of truth for which cards a column
  shows: `useCardsInStatus(status)` then `filter ? allCards.filter(evaluateFilter(...)) : allCards`.
  The derived visible-id list must use the identical `evaluateFilter` logic so it never drifts
  from what is rendered.
- `apps/web/components/card/card-context-menu.tsx` — canonical pattern for a menu item that
  triggers a confirmation `Dialog` (`Archive`/`Delete` items, `Dialog`/`DialogFooter`, danger
  button). The column confirm dialog mirrors this structure and copy tone.
- `packages/commands/src/commands/card.ts` — `archiveCard` command (`syncArchiveCard` per id).
  The new bulk command lives beside it and reuses `syncArchiveCard` in a loop.
- `apps/web/lib/use-board.ts` — `useCardActions()` exposes `archive(cardId)` via
  `execute(archiveCard, ...)`. The bulk action (`archiveMany`) is added here the same way.
- `packages/commands/src/catalog.ts` / `catalog.test.ts` — command registry; new command is
  registered so it is agent-callable and covered by the catalog snapshot test.
- `packages/ui/src/components/context-menu.tsx` — the styling reference for the new
  `DropdownMenu` primitive (same Radix menu tokens: `bg-surface`, `border-line-subtle`,
  radius, item hover, separators). `packages/ui/src/index.ts` is the export barrel.

### Institutional Learnings

- `docs/units/UNIT-13`-era work (`2026-07-17-001-feat-column-header-and-empty-drop-plan.md`):
  the header "+" is bridged to a sibling subtree via a per-column React context
  (`column-composer-context.ts`) precisely because the header (`BoardColumn`) and the card
  list (`ColumnCards`) are separate subtrees. The archive action avoids that indirection by
  sourcing visible ids from `BoardView` (which already holds `allCards` + `filter`) rather
  than from `ColumnCards`.
- UNIT-9.6 established that `countByStatus(allCards, filter, filterCtx)` agrees with what
  `ColumnCards` renders. Deriving visible ids from the same `allCards`+`filter` therefore
  matches the header count by construction — satisfying R4.
- Design rules (CLAUDE.md §2, `docs/design/DESIGN.md`): icons are lucide SVGs never glyphs
  (3-dots = `MoreHorizontal`), motion is measured (dropdown/dialog enter-exit), dark mode
  first, compose shadcn/Radix primitives rather than a second component library.

### External References

- Radix UI `@radix-ui/react-dropdown-menu` — the shadcn `DropdownMenu` base. Pin the exact
  version at install time to match the existing Radix cohort in `packages/ui/package.json`
  (`react-context-menu` 2.3.3, `react-dialog`/`react-popover` 1.1.19). Record the resolved
  version in the unit doc (CLAUDE.md §4 — exact pins, no ranges).

## Key Technical Decisions

- **Add a `DropdownMenu` primitive rather than reuse `Popover` or `ContextMenu`.** A 3-dots
  affordance is a click-triggered menu button; the correct accessible pattern is a menu
  (`role="menu"`, roving focus), which Radix `dropdown-menu` provides and `Popover` does not.
  `ContextMenu` is right-click-only. The primitive is restyled to the exact tokens already used
  by `context-menu.tsx`, so the two menus look identical.
- **Bulk archive is a new command taking explicit `cardIds`, not a status.** The chosen scope
  is "only visible cards" (filter-aware). The UI knows which ids are visible; passing them
  explicitly makes the command's effect exact and unambiguous, keeps the confirmation count
  truthful, and gives agents a general "archive these cards" primitive (more composable than a
  status-scoped variant). It reuses `syncArchiveCard` per id in one execution.
- **Source visible ids from `BoardView`, not a context bridge.** `BoardView` already owns
  `allCards` + `filter` + `filterCtx` and computes counts; deriving the per-status id list there
  (with the same `evaluateFilter`) keeps a single filter source of truth and threads one extra
  prop (`visibleCardIds`) down the existing `BoardView → StatusColumn → BoardColumn` path — the
  same path `count` and `onAddCard` already take.
- **Menu renders only when the column has ≥1 visible card.** With a single archive action and
  nothing to archive in an empty column, showing a disabled menu adds noise; the 3-dots appears
  only when `count > 0`. (Revisit if/when non-archive items are added.)
- **Confirmation required, no undo.** Mirrors the card Delete confirm dialog; bulk archive is
  higher-impact than single archive, so it gets the dialog guard rather than the card's
  no-confirm single archive.

## Open Questions

### Resolved During Planning

- Filter scope of "Archive all": **only cards currently visible** under the active filter
  (user decision). Command takes explicit ids; confirmation count equals the header count.
- Empty columns: menu is not rendered when the column has no visible cards.
- Menu contents: **Archive all** only for now; primitive/structure allows future items.

### Deferred to Implementation

- Exact resolved `@radix-ui/react-dropdown-menu` version — pinned at install time.
- Final confirmation-dialog copy wording (directional draft in Unit 3) — tune to match
  `DESIGN.md` voice during implementation.
- Whether `visibleCardIdsByStatus` is extracted as a shared domain selector or derived inline
  in `BoardView` — decide when touching the code; either way it must reuse `evaluateFilter`
  so it cannot drift from `ColumnCards`.
- Whether the 3-dots shows only on column hover/focus or always — decide against `DESIGN.md`
  density guidance during implementation (lean: visible on header hover/focus, always visible
  while the menu is open).

## Implementation Units

- [ ] **Unit 1: `DropdownMenu` UI primitive**

**Goal:** Add a reusable, Boardly-tokenized click-triggered menu primitive to `@boardly/ui`.

**Requirements:** R1, R6

**Dependencies:** None.

**Files:**

- Create: `packages/ui/src/components/dropdown-menu.tsx`
- Create: `packages/ui/src/components/dropdown-menu.test.tsx`
- Modify: `packages/ui/src/index.ts` (export the new primitives)
- Modify: `packages/ui/package.json` (add pinned `@radix-ui/react-dropdown-menu`)
- Modify: `docs/design/DESIGN.md` (document the new menu primitive)

**Approach:**

- Wrap Radix `dropdown-menu` with the same styled sub-components and class tokens as
  `context-menu.tsx` (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
  `DropdownMenuItem`, `DropdownMenuSeparator`, plus `DropdownMenuLabel`/`Group` if trivial).
  Reuse `bg-surface`, `border-line-subtle`, radius, item hover, and `variant="destructive"`
  item styling so it is visually identical to the right-click menu.
- Content renders in a portal with the standard enter/exit motion + `prefers-reduced-motion`
  respect already used by the other menus.
- Export from the barrel; pin the Radix dep exactly and record the version in the unit doc.

**Patterns to follow:** `packages/ui/src/components/context-menu.tsx`, its export block in
`packages/ui/src/index.ts`, `packages/ui/src/components/context-menu.test.tsx`.

**Test scenarios:**

- Happy path: trigger has no open menu initially; clicking it renders the content with a
  visible `menuitem`.
- Happy path: clicking a `DropdownMenuItem` fires its `onSelect` and closes the menu.
- Edge case: `Escape` closes an open menu.
- Accessibility: trigger exposes its accessible name; open content has `role="menu"` and items
  `role="menuitem"`.

**Verification:** Primitive renders and opens/closes; visually matches the context menu in dark
mode; exported from `@boardly/ui`; dep pinned exactly; `DESIGN.md` updated.

---

- [ ] **Unit 2: Bulk `archiveCards` command + `archiveMany` web action**

**Goal:** A command that archives an explicit list of card ids in one execution, exposed to
the UI via `useCardActions`.

**Requirements:** R4, R5

**Dependencies:** None (independent of Unit 1).

**Files:**

- Modify: `packages/commands/src/commands/card.ts` (add `archiveCards` command)
- Modify: `packages/commands/src/catalog.ts` (register it)
- Modify: `packages/commands/src/commands/card.test.ts` (or the nearest existing card command
  test file) and `packages/commands/src/catalog.test.ts`
- Modify: `apps/web/lib/use-board.ts` (`useCardActions`: add `archiveMany(cardIds)` +
  `CardActions` type)

**Approach:**

- Define `archiveCards` with zod input `{ cardIds: z.array(z.string()) }`; in `run`, get the
  board doc once and call `syncArchiveCard(doc, id, ctx.now(), ctx.userId ?? ctx.clientId)` for
  each id. Return `{ archivedIds }` (or `{ count }`) for a useful agent result. Skip/ignore ids
  that don't resolve to a live card rather than throwing, so a partially-stale list is safe.
- Register in the catalog so it is agent-callable and covered by the catalog test.
- In `use-board.ts`, add `archiveMany = useCallback((ids) => execute(archiveCards, ctx, { cardIds: ids }), [ctx])`
  mirroring the existing `archive` action, and extend the `CardActions` type.

**Patterns to follow:** `archiveCard`/`deleteCard` in `packages/commands/src/commands/card.ts`;
the `archive` action + `CardActions` interface in `apps/web/lib/use-board.ts`; catalog
registration + `catalog.test.ts` snapshot.

**Test scenarios:**

- Happy path: two live cards in a status; `archiveCards({cardIds:[a,b]})` marks both archived;
  `cardsInStatus(status)` (live) no longer includes them; return value reports both.
- Edge case: empty `cardIds` array is a no-op (nothing archived, no throw).
- Edge case: a `cardIds` list containing an unknown/already-archived id archives the valid ones
  and ignores the rest without throwing.
- Integration: `catalog.test.ts` includes `archiveCards` in the registered-command set.

**Verification:** Command archives all supplied live cards, tolerates stale/empty input, is
registered in the catalog, and `useCardActions().archiveMany` executes it.

---

- [ ] **Unit 3: Column menu button, confirm dialog, and board wiring**

**Goal:** Render the 3-dots menu in the column header, wire "Archive all" to a confirmation
dialog that archives the column's visible cards, and thread the visible-id list down from
`BoardView`.

**Requirements:** R1, R2, R3, R4, R6

**Dependencies:** Unit 1 (`DropdownMenu`), Unit 2 (`archiveMany`).

**Files:**

- Create: `apps/web/components/board/column-menu.tsx` (menu trigger + dropdown + confirm dialog)
- Create: `apps/web/components/board/column-menu.test.tsx`
- Modify: `apps/web/components/board/column.tsx` (`BoardColumn`: render the menu in the header,
  next to "+"; accept the menu via prop/slot; only when there are visible cards)
- Modify: `apps/web/components/board/dnd.tsx` (`StatusColumn`: accept `visibleCardIds`, render
  `ColumnMenu`, pass it into `BoardColumn`)
- Modify: `apps/web/components/board/board-view.tsx` (derive per-status visible card ids and
  pass `visibleCardIds` to `StatusColumn`; also pass to the swimlane path if trivially applicable)
- Modify (optional): `packages/domain` selector for `visibleCardIdsByStatus` if extracted
- Modify: `docs/design/DESIGN.md` (column header interaction: 3-dots menu + confirm)

**Approach:**

- `ColumnMenu({ status, visibleCardIds })`: a `DropdownMenu` whose trigger is a 3-dots
  (`MoreHorizontal`) icon button styled like the header "+" (`size-6`, hover, focus ring,
  accessible name e.g. `Column actions`). One `DropdownMenuItem` "Archive all" with an
  `Archive` icon opens a confirmation `Dialog`. On confirm, call
  `useCardActions().archiveMany(visibleCardIds)` and close.
- Confirmation dialog mirrors the card Delete dialog: title e.g. "Archive all N cards in
  {statusName}?"; body explains the cards are archived (removed from the board); footer with a
  Cancel ghost button and a primary "Archive" button carrying the `Archive` icon. `N` and the
  status name come from `visibleCardIds.length` and `STATUS_META[status].name`.
- `BoardColumn`: render the menu button in the header trailing cluster beside "+"; only render
  the menu when there is at least one visible card. Keep `BoardColumn` presentational — accept
  the menu as a `menu?: ReactNode` slot (parallel to `onAddCard`) so the hook-using logic stays
  in `ColumnMenu`/`StatusColumn`.
- `BoardView`: derive `visibleCardIds` per status from `allCards` + `filter` + `filterCtx`
  using the same `evaluateFilter` path as `ColumnCards` (ideally a shared selector), so the
  list equals what each column renders and matches `count`. Thread it into `StatusColumn`.

**Technical design:** _(directional guidance for review, not implementation spec)_

    BoardView
      counts            = countByStatus(allCards, filter, filterCtx)
      visibleIdsByStatus= group(allCards, filter, filterCtx) -> Record<Status, string[]>
      <StatusColumn status count visibleCardIds={visibleIdsByStatus[status]}>
        <ColumnCards .../>              // renders the same filtered cards

    StatusColumn(status, count, visibleCardIds)
      <BoardColumn ... onAddCard menu={<ColumnMenu status visibleCardIds/>}>

    ColumnMenu(status, visibleCardIds)          // only mounted when count > 0
      DropdownMenu
        Trigger: [•••] button "Column actions"
        Item "Archive all" -> setConfirmOpen(true)
      Dialog(confirmOpen)
        "Archive all {N} cards in {status}?"  [Cancel] [Archive]
          onConfirm -> archiveMany(visibleCardIds)

**Patterns to follow:** `card-context-menu.tsx` (menu item → confirm `Dialog` → command action);
the `onAddCard` prop threading in `column.tsx`/`dnd.tsx`/`board-view.tsx`; `column.test.tsx`
setup helpers (`createMemoryContext`, `initBoard`, `BoardlyProvider`, `BoardView`).

**Test scenarios:**

- Happy path: a column with 3 cards shows a "Column actions" button; opening it and selecting
  "Archive all" opens a dialog naming 3 cards; confirming archives all 3 → the column becomes
  empty and `cardsInStatus(status)` (live) is empty.
- Edge case: an empty column renders no "Column actions" button (menu absent when count 0).
- Edge case: Cancel in the confirm dialog archives nothing and closes the dialog.
- Filter integration (R4): with an active filter hiding some cards in a status, the dialog count
  equals the visible count, and confirming archives only the visible cards — filtered-out cards
  remain live.
- Accessibility: the trigger has an accessible name; Esc closes the menu and, separately, the
  dialog.

**Verification:** 3-dots menu appears on non-empty columns, "Archive all" confirm archives
exactly the visible cards (verified in dark mode via the preview + a filtered case), empty
columns show no menu, and `column-menu.test.tsx` covers the scenarios above.

## System-Wide Impact

- **Interaction graph:** New `ColumnMenu` sits in the column header beside the add-card "+" and
  the keyboard-nav `data-nav="column"` target; it must not interfere with column focus/keyboard
  nav (`keyboard-nav.tsx`) or drag-and-drop (the header is not a drag handle, but verify the
  menu button click doesn't start a drag). Archiving mutates the board doc, so open card
  details / counts / empty-column visibility all update reactively through the existing `useY`
  bindings.
- **Error propagation:** `archiveCards` tolerates stale/unknown ids (no throw), so a click on a
  slightly stale visible list still succeeds for the valid cards.
- **State lifecycle risks:** If a card was moved out of the column between menu-open and confirm,
  it simply won't be in `visibleCardIds` (or won't resolve) — no partial-write corruption; the
  command is id-explicit. Confirm dialog state is local to `ColumnMenu`.
- **API surface parity:** The bulk archive is a registered command, so the agent surface gains
  "archive these cards" — matching the new UI capability (agent-native parity, plan R13). The
  existing single `archiveCard` command is unchanged.
- **Integration coverage:** The filter-aware count/id parity (R4) is the key cross-layer behavior
  — covered by the filtered test scenario in Unit 3 rather than mocks.
- **Unchanged invariants:** Columns remain fixed Linear statuses (no rename/add/remove/reorder);
  per-card archive, add-card "+", drag/drop, and the hide-empty toggle are untouched.

## Risks & Dependencies

| Risk                                                                              | Mitigation                                                                                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visible-id list drifts from what the column renders (archives wrong/hidden cards) | Derive ids from the same `allCards`+`filter`+`evaluateFilter` as `ColumnCards`; assert count/id parity in a filtered test (Unit 3).                        |
| New Radix dep version drifts from the existing cohort                             | Pin exactly at install time, matching the current Radix versions; record in the unit doc.                                                                  |
| 3-dots button competes with column keyboard nav / drag                            | Header is not a drag handle; give the button its own focus ring and accessible name; verify nav still lands on the column and the button is Tab-reachable. |
| Bulk archive with no undo surprises the user                                      | Confirmation dialog with an explicit count is the guard; wording states cards are archived (recoverable in the future archive view), not deleted.          |

## Documentation / Operational Notes

- Write `docs/units/UNIT-14-column-archive-menu.md` (what/why/how/verify/follow-ups) and commit
  it with the work (CLAUDE.md §1 same-commit rule; subject carries `UNIT-14`).
- Update `docs/design/DESIGN.md` for the new `DropdownMenu` primitive (Unit 1) and the column
  header interaction change (Unit 3) — DESIGN.md is required for any visual/interaction change.
- Follow-up (out of scope): an Archive view to browse/restore archived cards would make bulk
  archive fully reversible; note it in the unit doc's Follow-ups.

## Sources & References

- Request: add a 3-dots menu button in the column showing an archive button to archive all items
  in the column, with confirmation.
- Related code: `apps/web/components/board/column.tsx`, `dnd.tsx`, `board-view.tsx`,
  `column-cards.tsx`; `apps/web/components/card/card-context-menu.tsx`;
  `packages/commands/src/commands/card.ts`, `catalog.ts`; `apps/web/lib/use-board.ts`;
  `packages/ui/src/components/context-menu.tsx`, `packages/ui/src/index.ts`.
- Related prior work: `docs/plans/2026-07-17-001-feat-column-header-and-empty-drop-plan.md`
  (UNIT-13 column header), UNIT-9.2 (hard delete), UNIT-9.6 (filter-aware empty columns).
- Binding rules: `CLAUDE.md`, `docs/design/DESIGN.md`.
