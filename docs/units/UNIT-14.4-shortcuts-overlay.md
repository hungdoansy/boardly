# UNIT 14.4: Shortcuts help overlay (`?`)

- **Plan unit:** 14.4 (`docs/plans/2026-07-24-001-feat-keyboard-shortcuts-nav-plan.md`)
- **Status:** done
- **Requirements:** R3, R4
- **Commit(s):** _pending_

## What changed

- **Create `apps/web/components/command-palette/shortcuts-overlay.tsx`** — a Radix
  `Dialog` listing every shortcut, grouped **General / Navigation / Board**, with
  `<kbd>` keycaps.
- **Create `apps/web/components/command-palette/shortcuts-overlay.test.tsx`**.
- **Modify `apps/web/components/app/workspace-app.tsx`** — `useGlobalKeyboard` gains
  an `onOpenHelp` opt and a `?` (`e.key === "?"`) branch; `Shell` owns `helpOpen`
  and mounts the overlay.
- **Modify `docs/design/DESIGN.md`** — §5 marks the `?` overlay implemented and lists
  the new shortcuts.

## Why (decisions)

- **Fulfils a standing DESIGN.md §5 spec** ("document shortcuts in a `?` overlay")
  that was never built.
- **`?` cannot collide with `/`.** `?` is Shift+`/`, so `e.key` is `"?"` — a
  distinct branch from `e.key === "/"`. The global guard bails on ⌘/Ctrl/Alt but not
  Shift (like `Shift+F`), so `?` reaches the handler.
- **Glyph rules (DESIGN §7.1).** Keys render as `<kbd>` keycaps (the text-keycap
  exception). The command (⌘) key is the lucide `Command` icon — never the glyph —
  and **arrow keys use lucide arrow icons**, because arrow glyphs are banned even
  inside keycaps. Letters/`Esc`/`Shift`/`/`/`?`/`Enter` are text keycaps.
- **Hand-maintained display list** — the `GROUPS` array is the one place the
  overlay's rows are defined, but it is _not_ derived from the real bindings
  (`LEADER_REGISTRY`, `useGlobalKeyboard`, `useBoardKeyboardNav`). Keep it in sync
  by hand when adding/changing a shortcut; the two can otherwise silently drift.

## How it works

`?` → `useGlobalKeyboard` → `onOpenHelp()` → `setHelpOpen(true)`. The overlay is a
Radix `Dialog`, so `Esc` closes it and the global ESC ladder yields to it
(`escIsOwnedElsewhere` sees an open dialog). Also opened from the sidebar `?` button
(UNIT 14.5) and the palette (UNIT 14.5).

## Design (UI)

- Tokens/components: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` (shadcn),
  `<kbd>` styled with `--radius-sm`, `border-line`, `bg-elevated`, `text-fg-muted`,
  `font-mono text-xs`. Grouped rows: label left, keycaps right. Dark-mode-first.
  Screenshot: _to attach in review_ (dark).

## How to test / verify

- `shortcuts-overlay.test.tsx`: open → dialog named "Keyboard shortcuts" with sample
  labels across all three groups; closed → not rendered.
- `workspace-app.test.tsx`: `?` calls `onOpenHelp` and does NOT open search; `/` still
  opens search (no regression).
- Manual: `?` opens the overlay; `Esc` closes it; every listed shortcut is accurate.

## Follow-ups / known gaps

- Platform-accurate glyphs (Ctrl vs ⌘ per OS) are deferred (no `isMac` helper yet —
  see the plan's Deferred to Separate Tasks).
