# UNIT 12.2: Context menu — uniform item shape + canonical entity glyphs + project-icon rule

- **Plan unit:** Unit 12.2 (`docs/plans/2026-07-15-001-feat-context-menu-and-density-polish-plan.md`)
- **Status:** done
- **Requirements:** R3, R4, R5
- **Commit(s):** _this commit_

## What changed

- **`apps/web/components/card/card-context-menu.tsx`** — the card right-click menu was the app's lone
  surface drawing Priority/Project as bespoke 10px colored dots (and it gave the "Project" submenu
  trigger and "No project" option **no** leading glyph at all). Now every row shares the same shape
  and reuses the app's canonical glyphs:
  - **Priority** (sub-trigger + each radio item): `size-2.5 rounded-full` dot → **`PriorityIcon`**
    (the shared 14px bar glyph from `priority-badge.tsx`, same as the card face and priority picker).
  - **Project** radio items: dot → lucide **`Box`** at `size-3.5` tinted `style={{ color: p.color }}`.
  - **Project** sub-trigger: gained a leading lucide **`Boxes`** (`size-3.5 text-fg-faint`), matching
    the sidebar "All projects" affordance.
  - **"No project"** radio: gained a leading untinted **`Box`** (`size-3.5 text-fg-faint`).
  - Imports updated (`Box`, `Boxes` from `lucide-react`; `PriorityIcon` from `./priority-badge`).
- **`docs/design/DESIGN.md` §7.3 (new, binding):** documents the **entity-glyph rule** — status →
  `StatusIcon`, priority → `PriorityIcon` (never a dot), **project → `Box` tinted with the project
  color** (never a bare dot; `Boxes` for all/multiple, faint `Box` for none) — and a **menu/list item
  shape convention** (uniform `size-3.5` leading-glyph slot on every row, `text-base`, `gap-2`).
- **`apps/web/components/card/card-context-menu.test.tsx`** — added a test asserting each submenu
  trigger carries a leading SVG glyph (two SVGs: glyph + chevron) and that no `.rounded-full` color
  dot remains in the open menu.

## Why (decisions)

- **Reuse canonical glyphs, don't restyle a one-off.** Everywhere else a project is already a tinted
  `Box` (`project-list.tsx`, `project-chip.tsx`, `project-select.tsx`) and priority is `PriorityIcon`
  (`priority-select.tsx`, card face). The menu diverging into colored dots was the bug; converging on
  the shared glyphs fixes both the alignment (all leading glyphs are now a uniform 14px) and the
  visual language in one move.
- **Every row gets a leading glyph — including submenu triggers and "none" options.** Missing slots
  were why the "Project" trigger's label sat left of the others. A uniform 14px slot + the existing
  `gap-2`/`text-base` from `itemBase` makes every text left-edge line up.
- **"No project" uses a faint `Box`** (not full-strength) to read as absence, distinct from a real
  white-colored project; the tinted `Box` carries each real project's color.
- **Rule written into `DESIGN.md`** (the user's explicit ask): §7.3 now binds the entity-glyph and
  menu-item-shape conventions so the next surface follows them instead of re-inventing dots.

## How it works

- `PriorityIcon` and `StatusIcon` render fixed 14×14 SVGs; the lucide `Box`/`Boxes` are sized with
  `size-3.5` (14px). Radix `ContextMenuSubTrigger` appends the trailing `ChevronRight` itself, so a
  submenu-trigger row shows leading-glyph + label + chevron. Color rides on the glyph via inline
  `style` from the domain (`project.color`) — no hardcoded values.
- Behavior is untouched: `setPriority` / `setProject` (and the radio `value`/`onValueChange` wiring)
  are byte-for-byte the same; only the leading visuals changed.

## How to test / verify

- `apps/web/components/card/card-context-menu.test.tsx`: the existing "opens with expected items",
  open/archive/delete/copy tests stay green; the new glyph/shape test asserts leading SVGs on the
  Priority/Project triggers and zero `.rounded-full` dots. Run: `pnpm --filter @boardly/web test`.
- Dark-mode visual check: right-click a card — all rows' text left-edges align on a uniform 14px icon
  column; projects show a tinted `Box`, priority shows the bar glyph, "No project" a faint `Box`, and
  the "Project" submenu a faint `Boxes`.

## Follow-ups / known gaps

- Submenu **contents** (the project/priority radio _items_) aren't asserted in jsdom because Radix
  only mounts sub-content on pointer-open, which is brittle to drive in the test env; the dark-mode
  screenshot covers them. The top-level shape/dot regression is asserted.
- Other menus (command palette, list-view row menus) already use token glyphs; no change needed, but
  §7.3 now governs any future ones.
