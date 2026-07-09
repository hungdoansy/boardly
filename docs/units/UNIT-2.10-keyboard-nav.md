# UNIT 2.10: Keyboard-first navigation

- **Plan unit:** 2.10 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R8
- **Dependencies:** 1.6 (dnd), 2.1 (card detail) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Full mouse-free operation of a board: rove focus with the arrow keys and act on the focused
card/column with single-key shortcuts.

- `apps/web/components/board/keyboard-nav.tsx` — new. Pure focus logic (`moveFocus`,
  `initialFocus`, `focusAfterRemoval`) + DOM adapters (`readLayout`, `readFocus`, `focusCard`) +
  the `useBoardKeyboardNav(rootRef, handlers)` hook that installs one `keydown` listener on the
  board root.
- `apps/web/components/board/board-view.tsx` — gives the scroll container a `ref`, wires the hook
  (`onOpenCard`/`onArchiveCard`/`onCyclePriority`), adds a `cyclePriority` action (reads the card
  via `getCard`, advances through `Priority` values), and restores focus to a card after its
  detail sheet closes (`closeCard`).
- `apps/web/components/board/dnd.tsx` — the card wrapper (already the dnd draggable/focusable node)
  now carries `data-nav="card"`/`data-card-id`/`data-column-id` and a `focus-visible` ring; the
  `KeyboardSensor` is restricted to **Space** for start/end (was Space **and** Enter) so **Enter**
  is free to open a card and arrows rove focus when no drag is active.
- `apps/web/components/board/column.tsx` — the column `<section>` gets `data-nav-column`; its title
  button gets `data-nav="column"`/`data-column-id` (the header is a focus target).
- `apps/web/components/card/card-composer.tsx` — the trigger button and the input both get
  `data-nav-composer` so `c` can open/focus the right column's composer.
- Tests: `apps/web/components/board/keyboard-nav.test.tsx`.

### Shortcut map

| Key              | When                | Effect                                                                               |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------ |
| `↑` `↓`          | card/header focused | move within a column; `↑` from the first card lands on the column header             |
| `←` `→`          | card/header focused | move to the adjacent column, preserving the row (clamped); empty column → its header |
| `Enter`          | card focused        | open the card detail                                                                 |
| `c`              | card/header focused | open the focused column's "add card" composer                                        |
| `e`              | card focused        | archive the card; focus falls to the next card, else previous, else the header       |
| `p`              | card focused        | cycle priority None→Low→Medium→High→Urgent→None                                      |
| `Space` + arrows | card focused        | pick up / move / drop (dnd-kit keyboard sensor from 1.6)                             |

Shortcuts are ignored while typing in a field (`INPUT`/`TEXTAREA`/`SELECT`/contenteditable), while
a modifier is held (so ⌘K still opens the palette), and while a keyboard drag owns the arrows.

## Why (decisions)

- **The focus model is derived from the DOM, not mirrored into React state.** The focused item is
  whatever `document.activeElement` is; the board layout is read from `data-nav-*` markup at keydown
  time. This keeps focus in the one place it actually lives (CLAUDE.md §3 "derive, don't
  synchronize"), stays correct as cards stream in from Yjs with zero subscription bookkeeping, and
  lets the movement rules be **pure functions over a plain layout** — trivially unit-testable
  without a DOM.
- **One focusable node per card.** The card wrapper is already the dnd draggable and is focusable;
  reusing it (rather than the inner title button) means one arrow-nav stop per card, `Space` picks
  it up, and `Enter`/`e`/`p` act on it. Shortcuts only fire when `document.activeElement` _is_ a nav
  item (not merely inside one), so a focused inner control never double-triggers.
- **Space, not Enter, to drag.** dnd-kit's default keyboard activator is Space+Enter; leaving Enter
  bound to drag would collide with "Enter opens". Restricting to Space matches Linear's "grab" gesture
  and frees Enter.
- **`aria-pressed` gates the arrows.** A picked-up card reports `aria-pressed="true"` (from dnd-kit's
  `attributes`); the nav hook sees that and yields the arrow keys to the drag, with no cross-component
  wiring or shared "isDragging" state.
- **Explicit focus restore after the detail closes.** Because the sheet opens from React state (not a
  Radix `DialogTrigger`), Radix's auto-restore lands on `<body>`; `board-view` records the opened card
  and re-focuses it on close so an Enter → edit → Esc round-trip returns the user exactly where they
  were (the plan's third edge case).
- **`c` drives the existing composer** instead of creating a bare "New card" — the user types a real
  title immediately, so keyboard create matches mouse create (no throwaway placeholder cards).

## Design (UI)

Focus ring uses the existing `focus-visible:ring-2 focus-visible:ring-[var(--accent)]` token on the
card wrapper — consistent with every other focusable in `docs/design/DESIGN.md`. No new visual
elements. Screenshot (dark, first card focused): `docs/units/screenshots/UNIT-2.10-keyboard-nav-dark.png`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web test` — `keyboard-nav.test.tsx`:
  - **pure logic** — `moveFocus` (down/up with header step, left/right row-preserve + clamp, edge
    clamp, header-carry), `initialFocus`, `focusAfterRemoval`;
  - **integration** (jsdom fixture with `data-nav-*` markup + the real hook) — arrows rove focus
    across cards/columns; Enter/`p`/`e` invoke the right handlers; `c` clicks the focused column's
    composer; shortcuts are ignored in a field and with a modifier held.
- Full gates: `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`
  (domain 26 / sync 19 / commands 7 / ui 2 / web 71), `pnpm --filter @boardly/web build`,
  `pnpm format:check` — all green.
- **Live keyboard-only sequence (Playwright MCP, dark):** ⌘K → "Create board" → Enter creates and
  opens a board; `c` → type → Enter creates two cards; `↓`/`→`/`←` move focus; `Enter` opens the
  card detail; `Esc` closes and focus returns to the card; `Space`→`→`→`Space` moves a card to the
  next column; `p` cycles priority to Medium; `e` archives and focus falls back to the column header.
  All confirmed.

## Follow-ups / known gaps

- **Assign label / set-priority menu** — the plan mentions "assign" and a richer priority action.
  `p` currently cycles (fast, no popup); a keyboard-driven label/priority _menu_ is deferred until the
  label-assign UX is generalized (candidate for the 2.9 command palette once the focus model is
  reused there, and 4.x filters).
- **Reclaimed ("Unsorted") cards** are not part of the arrow-nav layout (no `data-nav-column`); they
  remain mouse/Tab reachable. Worth adding if the unsorted lane becomes common.
- **Vertical wrap** is a hard stop at column edges (no wrap-around); revisit if user testing wants it.
