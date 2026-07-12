# UNIT 2: Fix cmd+K palette selected-row contrast

- **Plan unit:** 2 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R2
- **Commit(s):** `774aee3`

## What changed

- `packages/ui/src/components/command.tsx` — `CommandItem`'s
  `data-[selected=true]` styling changed from `bg-overlay` to `bg-selected`,
  and the item now reserves a `border-l-2 border-l-transparent` on its
  unselected state with `data-[selected=true]:border-l-[var(--accent)]`
  swapping the color on selection.
- `apps/web/components/command-palette/palette.test.tsx` — new test
  asserting the auto-selected (first) item carries `bg-selected` (not
  `bg-overlay`) and the accent border class.

## Why (decisions)

- **Root cause:** `CommandDialog`'s `DialogContent` (`packages/ui/src/components/dialog.tsx`)
  renders on `bg-popover`, which resolves to the same `--bg-overlay` token
  (`packages/ui/src/theme.css`) `CommandItem`'s selected state used — the
  highlighted row and its container were the identical color, so keyboard
  navigation was invisible.
- **`bg-selected` + accent left-border, not a new token.** `docs/design/DESIGN.md`
  already reserves `--bg-selected` for "selected row/card tint" and already
  documents this exact tint + 2px accent-left-border pairing for card-face
  selection. Reusing it keeps the palette consistent with the one existing
  "selected" convention instead of inventing a second one.
- **Reserve the border space on the unselected state too.** Adding
  `border-l-2` only on `data-[selected=true]` would shift every row's content
  ~2px to the right the instant it becomes selected (and back on deselect) —
  a layout shift during exactly the fast keyboard-navigation flow this fix is
  meant to make legible. Giving the unselected state a `border-l-transparent`
  reservation of the same width means only the border's *color* changes.

## How it works

Pure Tailwind class change on `CommandItem`; `cmdk` (the underlying library)
already sets `data-selected="true"` on the active item and updates it on
arrow-key navigation / hover, so no new state management is needed.

## Design

- Tokens: `--bg-selected` (`rgba(94,106,210,0.14)` dark / `0.1` light,
  accent-derived), `--accent` for the border.
- No new transition — the color swap on `data-selected` doesn't need one;
  `cmdk` already handles focus movement.
- Dark mode: verified live in the demo account — the auto-selected "New card"
  action row shows a clearly visible indigo tint with a solid left border,
  distinct from the dialog's `--bg-overlay` background.

## How to test / verify

- `apps/web/components/command-palette/palette.test.tsx` — asserts the class
  list directly (`bg-selected` present, `bg-overlay` absent, accent border
  present).
- Manual (dark mode): open cmd+K, arrow through results — the highlighted row
  is clearly distinct from the dialog background at every step, with no
  visible content shift when a row becomes/stops being selected.

## Follow-ups / known gaps

- This is the first real implementation of the `bg-selected` + accent-border
  "selected" pairing anywhere in the codebase (card-face selection was
  documented in `DESIGN.md` but not yet built). If a future unit adds
  list-view or card-face row selection, it should match this exact treatment.
