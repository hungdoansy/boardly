# UNIT 14.5: Command-palette parity + `?` hint

- **Plan unit:** 14.5 (`docs/plans/2026-07-24-001-feat-keyboard-shortcuts-nav-plan.md`)
- **Status:** done
- **Requirements:** R4
- **Commit(s):** _pending_

## What changed

- **Modify `apps/web/components/command-palette/palette.tsx`**:
  - `CommandPalette` takes `onGoToProject` and `onShowShortcuts` props.
  - Adds two `CommandItem`s to the Actions group: **"Go to project…"** (opens the
    switcher) and **"Keyboard shortcuts"** (opens the overlay), each via a
    `runThenOpen` helper.
- **Modify `apps/web/components/app/workspace-app.tsx`**:
  - `Shell` passes `onGoToProject={openSwitcher}` / `onShowShortcuts={openHelp}` to
    the palette.
  - `Sidebar` gains an `onOpenHelp` prop and a footer **`?` (Keyboard) button** next
    to the theme toggle.
- Existing `workspace-app.test.tsx` updated for the new `Sidebar`/`useGlobalKeyboard`
  props.

## Why (decisions)

- **Agent-native / UI parity (CLAUDE.md §3, plan R13).** Every new keyboard action
  is also reachable from `⌘K`; the palette items call the _same_ open-functions the
  keys do (single behavior source).
- **`runThenOpen` closes the palette first, then opens the target on the next frame**
  (`requestAnimationFrame`), so focus hands off cleanly instead of two Radix dialogs
  briefly contending for it.
- **A visible `?` button** in the sidebar footer makes the overlay discoverable
  without memorizing the key; icon is the lucide `Keyboard` (SVG, not a glyph).

## How it works

Palette item → `runThenOpen(openTarget)` → `setOpenState(false)` then
`requestAnimationFrame(openTarget)` → the switcher/overlay opens with the palette
gone. The sidebar `?` button calls `onOpenHelp` directly.

## Design (UI)

- Palette items: `Boxes` (Go to project) and `Keyboard` (shortcuts) lucide icons,
  standard `CommandItem` styling. Sidebar `?` button mirrors the other footer
  controls (ghost, `--dur-fast` hover, focus-visible ring). Dark-mode-first.
  Screenshot: _to attach in review_ (dark).

## How to test / verify

- `workspace-app.test.tsx`: `Sidebar` renders with the new prop; placement test
  unaffected (the `?` button sits in the footer beside Account/theme).
- Manual: `⌘K` → "Go to project…" opens the switcher; "Keyboard shortcuts" opens the
  overlay; the sidebar `?` button opens the overlay; the palette closes cleanly
  before each.

## Review follow-ups (ce:review)

- **Focus hand-off, not a rAF race (frontend-races/adversarial, P1).** The original
  `runThenOpen` used `requestAnimationFrame` to open the target after closing the
  palette, but Radix keeps the closing palette's FocusScope mounted for the full
  ~220ms exit animation and would restore focus to it _after_ the new dialog grabbed
  it. Now the palette closes and the target opens in the same tick, and a
  `chainingRef` makes the palette's `onCloseAutoFocus` a no-op so Radix does not steal
  focus back. `CommandDialog` gained an `onCloseAutoFocus` pass-through
  (`packages/ui/src/components/command.tsx`).
- **Icon sizing (project-standards, P2).** The command-menu rows now use `size-3.5`
  (14px) per DESIGN.md §7.1's binding "menu / list item shape" rule — this also
  brought the pre-existing palette icons (New card, card results) into compliance.

## Follow-ups / known gaps

- None. Additional `g`-prefixed destinations (e.g. `g s` Settings) remain a future
  unit on the leader registry.
