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

## Follow-ups / known gaps

- None. Additional `g`-prefixed destinations (e.g. `g s` Settings) remain a future
  unit on the leader registry.
