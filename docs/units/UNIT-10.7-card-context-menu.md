# UNIT 10.7: Card face context menu

- **Plan unit:** Unit 7 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R3 (Linear-style right-click menu on board cards, command-backed)
- **Dependencies:** UNIT-10.2 (ContextMenu + Toast + clipboard)

## What changed

- **`apps/web/components/card/card-context-menu.tsx`** (new) — `CardContextMenu` wraps a card node
  as the `ContextMenu` trigger (`asChild`) and offers: **Open**; **Status** / **Priority** /
  **Project** radio submenus (current value checked); separator; **Copy link**; **Archive**;
  **Delete** (destructive → confirm `Dialog`). Every mutating item calls `useCardActions`
  (`setStatus`/`setPriority`/`setProject`/`archive`/`delete`); "Copy link" copies the card's deep
  link via `copyText` + `toast`.
- **`apps/web/components/board/dnd.tsx`** — `SortableCard` now wraps its draggable `<div>` in
  `CardContextMenu`. Radix `ContextMenuTrigger asChild` composes its ref/`onContextMenu` onto the
  dnd node (Radix `Slot` composes refs), so drag (`setNodeRef` + listeners) and the whole-card
  click-to-open (UNIT-9.7) are unaffected.
- **`apps/web/lib/use-boards.ts`** — extracted `cardHashBody(ctx, cardId)` (the ticket hash body,
  reused by the existing `writeCardHash`) and added `buildCardHref(ctx, cardId)` (absolute URL) for
  "Copy link".
- **Tests:** `apps/web/components/card/card-context-menu.test.tsx` — menu opens with the expected
  items; Open fires `onOpen`; Archive archives; Delete confirms then deletes; Copy link copies the
  href + toasts.

## Why

- **Faster than the drawer.** Common card actions (restatus, reprioritize, reproject, copy link,
  archive, delete) are one right-click away, matching Linear. Existing paths (drawer, keyboard,
  whole-card click) all remain.
- **Command-backed = agent-native parity (R13).** Each mutating item is an existing card command;
  no new mutation surface. "Copy link" is the only UI-only action.
- **Reuse the deep-link builder.** `cardHashBody` is factored out of `writeCardHash` so the copied
  URL is exactly the hash the app navigates to — no duplicated ref-format logic.
- **Coexist with drag/click.** Right-click (`onContextMenu`) is distinct from the 5px-activation
  drag and the left-click open; `Slot` ref-composition keeps the dnd node fully functional.

## How it works

Radix `ContextMenu.Trigger asChild` renders the draggable `<div>` as the trigger, merging its
`onContextMenu` and composing refs with dnd-kit's `setNodeRef`. Submenus use
`ContextMenuRadioGroup`/`RadioItem` seeded with the card's current status/priority/project (`""`
sentinel → "No project"); changing a value dispatches the matching action. Delete opens a confirm
`Dialog` (mirrors the drawer) before the hard delete.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/web exec vitest run components/card/card-context-menu.test.tsx`
  → 5 passed; full web suite `pnpm --filter @boardly/web test` → 211 passed (no regression from the
  `SortableCard` wrap).
- **Gates:** `@boardly/web` `typecheck` + `lint` green.
- **Manual (dark mode, `DESIGN.md`):** right-click a board card → the menu; Status/Priority/Project
  submenus show the current value checked and change it on select; Copy link puts the ticket URL on
  the clipboard with a toast; Archive removes it from the board; Delete asks to confirm. Left-click
  still opens the drawer and a real drag still works.

## Follow-ups / known gaps

- Submenu open-on-hover + radio selection are manual/e2e-verified (Radix sub open needs pointer
  timing jsdom doesn't drive); unit tests cover the top-level items + the sub-trigger presence.
- On touch, Radix opens the context menu on long-press, which could race a touch-drag; the app is
  desktop-first, so this is accepted for now.
