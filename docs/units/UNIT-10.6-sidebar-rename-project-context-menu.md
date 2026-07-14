# UNIT 10.6: Sidebar project row — inline rename + context menu

- **Plan unit:** Unit 6 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R1 (inline-rename projects from the sidebar), R3 (project-row context menu)
- **Dependencies:** UNIT-10.2 (ContextMenu primitive), UNIT-10.5 (hide/show)

## What changed

- **`apps/web/components/board/project-list.tsx`** — each project row is now:
  - **Inline-renameable:** double-click the row (or the context menu's **Rename**) swaps it for an
    autofocused input seeded with the name; Enter/blur commits via `actions.rename` (skipped when
    unchanged/empty), Escape cancels. Extracted a `RenameRow` subcomponent.
  - **Right-clickable:** a `ContextMenu` with **Rename**, a **Color** submenu (the `LABEL_COLORS`
    swatch grid → `actions.recolor`), and **Hide** (`actions.archive`). The row `<button>` is the
    `ContextMenuTrigger` (`asChild`), so left-click still selects the scope and double-click still
    edits.
  - Extracted a module-level `rowClass` and a `ProjectRow` subcomponent for the non-editing state.
- **`apps/web/components/board/project-list.test.tsx`** — new tests: inline rename on double-click
  (Enter commits), Escape cancels, rename via the context menu, hide via the context menu.

## Why

- **Rename where you read.** Renaming a project previously required opening Settings; Linear does it
  inline in the sidebar. Double-click + a Rename menu item both reach the same inline editor.
- **Reuse, don't reinvent.** The inline-edit commit logic mirrors the Settings `ProjectRow`; the
  menu is the shared `ContextMenu` primitive from UNIT-10.2; recolor/hide reuse the existing
  `useProjectActions` (all command-backed → agent-native parity).
- **Create stays select-only.** Auto-entering rename on create was considered but left out — it
  would change existing create-then-select behavior; users rename via double-click / the menu.

## How it works

`ProjectList` tracks a single `editingId`. A row renders `ProjectRow` (button + context menu)
normally, or `RenameRow` (input) when it is being edited. Radix `ContextMenu.Trigger asChild`
binds `onContextMenu` to the row button without disturbing its click/dblclick handlers; the menu
content + Color submenu portal to `<body>`.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/web exec vitest run components/board/project-list.test.tsx` →
  8 passed (4 new).
- **Gates:** `@boardly/web` `typecheck` + `lint` green.
- **Manual (dark mode, `DESIGN.md`):** double-click a project → inline input; rename and press
  Enter (Esc cancels). Right-click a project → Rename / Color ▸ / Hide; picking a color recolors,
  Hide moves it to Settings → Hidden. Left-click still scopes the board to the project.

## Follow-ups / known gaps

- The Color submenu's open-on-hover and swatch click are manual/e2e-verified (Radix sub open needs
  pointer timing jsdom doesn't drive); the unit tests cover Rename + Hide, which use direct
  item selection.
- **Escape-cancel blur race (fixed):** `RenameRow` commits on blur; removing the focused input on
  Escape fires a native blur that would otherwise commit the discarded text (a real-browser-only
  bug jsdom can't see). Guarded with a fire-once `finished` ref so the trailing blur no-ops, and
  covered by `apps/e2e/tests/project-rename.spec.ts` (Escape cancels, Enter commits).
