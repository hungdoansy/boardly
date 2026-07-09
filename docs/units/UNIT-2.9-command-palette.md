# UNIT 2.9: Command palette (⌘K)

- **Plan unit:** 2.9 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R8
- **Dependencies:** 1.5 (cards), 2.3 (priority/severity) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

A keyboard-driven command palette, opened with **⌘K / Ctrl-K** from anywhere in the app.

- `apps/web/components/command-palette/palette.tsx` — new `CommandPalette` client component.
  Owns its `open` state, installs a `document` `keydown` listener that toggles on
  `(metaKey||ctrlKey) && key==="k"` (with `preventDefault`), and renders `CommandDialog` +
  `CommandInput`/`CommandList`/`CommandEmpty`/`CommandGroup`/`CommandItem` (all from
  `@boardly/ui`, which wraps `cmdk`). A nested `NewCardItem` renders only when a board is open.
- `apps/web/components/app/workspace-app.tsx` — mounts `<CommandPalette />` once inside the
  `Shell` (under `BoardlyProvider`, so its hooks share the app's command context).
- `packages/ui/src/components/command.tsx` — added a screen-reader-only `DialogTitle`
  ("Command palette") inside `CommandDialog`'s `DialogContent`. Radix Dialog requires a title for
  accessibility; without it Radix logs a warning and the dialog has no accessible name.
- `apps/web/components/command-palette/palette.test.tsx` — RTL/jsdom tests.
- `vitest.setup.ts` — added inert `ResizeObserver` and `Element.prototype.scrollIntoView`
  polyfills. `cmdk` and Radix touch these at mount time and jsdom does not implement them; the
  stubs let any dialog/command-menu component render under test.

### Commands shipped

| Command                          | Availability               | Action (command layer)                                                                   |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| **Create board**                 | always                     | `boardActions.create()` then `select(id)` — creates board + default columns and opens it |
| **New card in "<first column>"** | when a board is open       | `cardActions.create(firstColumn.id, "New card")`                                         |
| **Jump to board <title>**        | one per non-archived board | `select(board.id)` (sets the `#board/<id>` hash)                                         |

Each item closes the palette on select. `CommandEmpty` shows **"No results."** when the fuzzy
filter (cmdk built-in) matches nothing.

## Why (decisions)

- **Self-contained `open` state + a document listener**, not a global shortcut manager. There is
  no keyboard-shortcut registry yet (that arrives with Unit 2.10's focus/keyboard model); a single
  local listener is the smallest thing that works and is trivial to lift into 2.10's registry later.
- **All actions route through the existing hooks** (`useBoardActions`, `useCardActions`,
  `useColumns`, `useSelectedBoard`) — which route through the command layer — so the palette adds
  **no new mutation path** (CLAUDE.md §3: all mutations go through `packages/commands`; agent-native
  parity, plan R13). The palette is purely a new _entry point_ to existing commands.
- **`NewCardItem` is a child component** so its `useColumns`/`useCardActions` subscriptions only
  mount when a board is selected — a board-less palette (empty workspace) renders only global
  commands, satisfying the plan's "works with no board open" edge case without conditional hooks.
- **sr-only `DialogTitle` rather than suppressing the Radix warning.** Giving the dialog a real
  accessible name is the correct fix and keeps the palette reachable for screen readers (keyboard
  a11y is a product goal, not just compliance).
- **Focus return on close** is handled by Radix Dialog's focus management (restores focus to the
  previously-focused element on unmount) — no extra code, and it covers the plan's third edge case.

## Design (UI)

Matches `docs/design/DESIGN.md` (dark-first). Dimmed overlay, centered popover on `bg-popover`,
group headings in `text-fg-faint` (11px), selected row on `bg-overlay`, left-aligned 16px icons,
search field with a leading magnifier. Screenshot:
`docs/units/screenshots/UNIT-2.9-command-palette-dark.png`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web test` — `palette.test.tsx`:
  1. closed until ⌘K, then shows the input + "Create board";
  2. clicking "Create board" adds a board via the command layer and closes the palette;
  3. a non-matching query shows "No results.";
  4. with a board selected, "New card in …" creates a card in the first column.
- Full gates: `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`
  (domain 26 / sync 19 / commands 7 / ui 2 / web 60), `pnpm --filter @boardly/web build`,
  `pnpm format:check` — all green.
- Manual (dark): ⌘K opens; typing filters; "Create board" and "Jump to board" work; Esc closes and
  focus returns; on an empty workspace only "Create board" shows.

## Follow-ups / known gaps

The plan lists a few palette actions deferred to the units that supply their prerequisites:

- **Set priority/severity on the focused card, assign label** — require a "focused card" model,
  which is introduced in **Unit 2.10 (keyboard-first navigation)**. These become palette actions
  once 2.10 lands.
- **Toggle theme** — deferred to **Unit 5.3** (light-mode/theme pass); the app is dark-only for now.
- **Search** — the palette's search _mode_ (jump to a card/board by fuzzy query) is folded into
  **Unit 2.11 (search)**; today's fuzzy filter only ranks the command list.

Noted alongside the unit checkbox in the plan.
