---
title: "feat: Card context-menu polish (mark-done, aligned items, project icons) + app density"
type: feat
status: active
date: 2026-07-15
---

# feat: Card context-menu polish (mark-done, aligned items, project icons) + app density

## Overview

Three small, user-facing polish changes:

1. **Mark done from right-click** — a top-level toggle on the card context menu that flips a card
   to **Done** (and back to **Todo** when already done), so completing a card is one click instead
   of opening the Status submenu.
2. **App gets denser** — reduce the whole type scale ~1px (base `13px → 12px`, proportional
   siblings) so Boardly reads tighter and more Linear-like.
3. **Context menu shapes up** — every item gets the **same shape** (uniform 14px leading-icon slot,
   `text-base`, `gap-2`), Priority/Project stop using bespoke colored dots and reuse the app's
   canonical glyphs (`PriorityIcon`, `Box` tinted with the project color). The project-icon
   convention is **written into `DESIGN.md` as a binding rule**.

All three are visual/interaction polish over existing, working machinery — no data model, command,
or persistence changes. Mutations continue to route through the existing command layer
(`useCardActions().setStatus`), preserving agent-native parity.

## Problem Frame

The card right-click menu is the fast path for triage, but today:

- **Completing a card takes two steps** (open Status submenu → pick Done). "Done" is the single most
  common triage action and deserves a one-click affordance.
- **Menu items don't share a shape.** `Open/Copy/Archive/Delete` use 14px lucide icons; Status uses
  the 14px `StatusIcon`; but **Priority and Project use 10px colored dots** (`size-2.5`), the
  **"Project" submenu trigger has no leading icon at all**, and **"No project" has none** — so the
  text left-edges and icon weights don't line up. The menu is the lone place in the app that draws
  projects as a bare dot; everywhere else (`project-list.tsx`, `project-chip.tsx`,
  `project-select.tsx`) a project is the lucide **`Box`** tinted with `project.color`, and priority
  is the shared **`PriorityIcon`** bar glyph (`priority-select.tsx`, card face).
- **The app runs a touch large.** Base type is `13px`; the user wants the whole app a step denser.

The font change has an app-wide blast radius that needs care: the type scale in
`packages/ui/src/theme.css` is defined as **absolute px** tokens (`--text-xs: 11px` … `--text-xl:
20px`), and `apps/web/app/globals.css` sets `body { font-size: 13px }`. Because the tokens are
absolute px, shrinking `body` alone does **not** cascade to text that uses an explicit `text-*`
class (most of the app). A real "whole app" reduction means shifting the tokens themselves and
sweeping the handful of hardcoded `text-[Npx]` literals.

## Requirements Trace

- **R1.** Right-clicking a card offers a one-click **Mark done** action; when the card is already
  Done it reads **Mark not done** and returns the card to **Todo** (toggle — user decision).
- **R2.** The app's default font size is reduced ~1px across the whole type scale (base `13 → 12`),
  keeping proportions; the reduction actually reaches text that uses `text-*` tokens and hardcoded
  `text-[Npx]` literals, not just unclassed body text.
- **R3.** Every card context-menu item shares the same shape: uniform 14px leading-icon slot,
  uniform text size, uniform spacing; text left-edges align.
- **R4.** Priority and Project menu items use the app's canonical glyphs (`PriorityIcon`; `Box`
  tinted with `project.color`) instead of bespoke colored dots; the "Project" submenu trigger and
  "No project" gain leading icons.
- **R5.** The project-icon convention is documented in `docs/design/DESIGN.md` as a binding rule.

## Scope Boundaries

- **Not** redesigning the context menu's item set or ordering beyond adding the mark-done toggle and
  fixing icon/shape.
- **Not** converting the type scale to `rem` or adding a root-`%` density knob (the user chose the
  contained ~1px px-shift over the rem-root refactor). Spacing/radii tokens are unchanged.
- **Not** touching the command layer, Yjs schema, or persistence — reusing existing actions.
- **Not** a light-mode pass; verification is dark-mode first per repo rules (light mode inherits the
  same token changes and gets a glance-check only).
- **Not** a global "replace every colored dot with an icon" sweep — status dots elsewhere (e.g.
  status columns) are out of scope; this plan touches the card context menu and the DESIGN rule.

## Context & Research

### Relevant Code and Patterns

- `apps/web/components/card/card-context-menu.tsx` — the menu being changed. Priority uses
  `span.size-2.5.rounded-full` (line ~105/119); Project uses the same dot (line ~141) and the
  Project `SubTrigger` has **no** icon (line ~132); "No project" radio has none (line ~138).
- `packages/ui/src/components/context-menu.tsx` — shared primitives. `itemBase` sets
  `gap-2 … px-2 py-1.5 text-[13px]` (line 20-21); `ContextMenuLabel` uses `text-[11px]` (line 105).
  These two hardcoded px literals are part of the R2 sweep.
- `apps/web/components/card/priority-badge.tsx` — exports **`PriorityIcon`** (14px bar glyph). This
  is the canonical priority glyph the menu should reuse (as `priority-select.tsx` already does).
- `apps/web/components/card/project-chip.tsx` / `project-select.tsx` /
  `apps/web/components/board/project-list.tsx` — canonical project glyph: **`Box`** at `size-3.5`
  tinted `style={{ color: project.color }}`; **`Boxes`** for the "All" affordance; untinted `Box`
  for "No project". This is the convention R5 formalizes.
- `packages/ui/src/components/status-icon.tsx` — `StatusIcon` (default `size = 14`), used by the
  Status submenu; reuse `variant="done"` / `variant="todo"` for the mark-done toggle glyph.
- `packages/domain/src/status.ts` — `Status.Done = "done"`, `Status.Todo = "todo"`,
  `STATUS_META[...]`, and **`isDoneStatus(status)`** (category `Completed`) to drive the toggle.
- `packages/ui/src/theme.css` (`@theme inline`, lines ~150-164) — the `--text-*` and
  `--text-*--line-height` tokens to shift.
- `apps/web/app/globals.css` — `body { font-size: 13px }` (line 19) and `.prose-boardly` heading
  sizes (h1 16px line 37, h2 14px line 39).
- `docs/design/DESIGN.md` — §3 Typography scale table (lines 133-147); §7.1 Iconography (binding,
  lines 231-251) — the natural home for the new entity-glyph rule (§7.3).

### Institutional Learnings

- Per `MEMORY.md` (`boardly-gate-drift`): `format:check` is red on ~49 untouched files — **only run
  prettier on files you touch**, never `prettier --write .`.
- Repo rule (`CLAUDE.md` §1, "same-commit rule"): any commit touching `apps/**` / `packages/**/src`
  must stage a doc surface in the **same** commit. Each unit here already updates `DESIGN.md` and/or
  a `docs/units/UNIT-12.x-*.md`, satisfying the soft pre-commit hook.
- Repo rule (`CLAUDE.md` §2/§7.1): icons are lucide SVGs, tokens over ad-hoc values, no Unicode
  glyphs; dark mode verified first.

### External References

None — this is convention-following polish over existing local patterns; no external research
warranted (3+ direct local examples exist for every pattern touched).

## Key Technical Decisions

- **Density via a ~1px downward shift of the px token scale, not a rem-root refactor** (user choice).
  The scale is small and discrete and the token API (`text-xs`…`text-xl`) stays stable; a rem
  conversion would ripple into spacing and require far wider re-verification for the same visual
  result.
- **The whole app shrinks only if the hardcoded `text-[Npx]` literals shift too.** There are 15
  such literals across 11 files (`10×text-[11px]`, `4×text-[13px]`, `1×text-[10px]`). Sweep them to
  the reduced values, preferring the nearest **token class** (`text-[13px] → text-base`,
  `text-[11px] → text-xs`) so future scale changes propagate automatically. The lone `text-[10px]`
  is a judgment call at implementation (nudge to `9px` only if the micro-label stays legible, else
  leave).
- **Menu reuses canonical glyphs, not bespoke dots.** Priority → `PriorityIcon`; Project → `Box`
  tinted. Single source of truth for entity iconography; the menu was the only outlier.
- **Mark-done is a toggle wired to the existing `setStatus` command** (agent-native parity, no new
  command). **"Mark not done" returns to `Todo`** — the canonical "active, not started" status;
  the card keeps no memory of its prior column (see deferred question on restoring prior status).
- **Uniform 14px (`size-3.5`) leading-icon slot for every menu item.** `itemBase` already gives
  `gap-2` and a single text size; the only fix needed is making every leading glyph 14px and
  ensuring no item (submenu triggers, "No project") is missing one.

## Open Questions

### Resolved During Planning

- **How to reduce font size?** → Shift the px token scale down ~1px (base `13→12`, proportional
  siblings + line-heights), plus sweep hardcoded `text-[Npx]`. (User-selected over rem-root.)
- **Mark-done behavior when already Done?** → Toggle to **Mark not done** → `Todo`. (User-selected.)
- **What glyph for projects / priority in the menu?** → App canonical: `Box` tinted / `PriorityIcon`.
- **Where does the "rule" live?** → `docs/design/DESIGN.md` §7 (new §7.3 entity-glyph rule), with a
  companion menu-item shape convention note.

### Deferred to Implementation

- **`text-[10px] → text-[9px]`?** Decide per-site at implementation based on legibility of that
  specific micro-label; leave at 10px if 9px reads too small in dark mode.
- **Exact new line-height values.** Target proportional nudges (below); fine-tune against real
  screenshots if a line looks cramped or loose.
- **"Mark not done" target status.** `Todo` chosen; restoring the card's _previous_ status would
  require tracking prior status (new state) — deferred as a possible future enhancement, not built
  here.

## Implementation Units

**Sequencing:** Units 12.2 and 12.3 both edit `card-context-menu.tsx`; do **12.2 then 12.3** so the
mark-done item is authored to the shape conventions 12.2 establishes. Unit 12.1 is independent of
both (different files, aside from the shared `context-menu.tsx` px-literal swap, which 12.1 owns).

---

- [ ] **Unit 12.1: Reduce the app-wide type scale (~1px)**

**Goal:** Make the whole app one step denser — base `13px → 12px` with proportional siblings and
line-heights — reaching token-classed and hardcoded-px text alike.

**Requirements:** R2

**Dependencies:** None

**Files:**

- Modify: `packages/ui/src/theme.css` — the `--text-*` and `--text-*--line-height` tokens.
- Modify: `apps/web/app/globals.css` — `body { font-size: 13px → 12px }`; `.prose-boardly h1`
  `16 → 15`, `h2` `14 → 13`.
- Modify (sweep, ~11 files): every hardcoded `text-[Npx]` in product source under `apps/web` and
  `packages/ui/src` → reduced value, preferring the nearest token class. Includes
  `packages/ui/src/components/context-menu.tsx` (`itemBase` `text-[13px] → text-base`;
  `ContextMenuLabel` `text-[11px] → text-xs`).
- Modify: `docs/design/DESIGN.md` §3 — update "Base size 13px" → 12px and the scale table.
- Doc: `docs/units/UNIT-12.1-app-density-type-scale.md`

**Approach:**

- Target token values (px, with line-height):
  `xs 11/16 → 10/15` · `sm 12/18 → 11/16` · `base 13/20 → 12/18` · `md 14/20 → 13/18` ·
  `lg 16/24 → 15/22` · `xl 20/28 → 18/26`. `body` `13 → 12`.
- Sweep hardcoded literals to tokens where they map cleanly so they auto-scale next time; only keep a
  raw `text-[Npx]` when no token matches. Verify with `grep -rE "text-\[1[0-9]px\]"` that nothing
  stale remains at the old sizes.
- Do **not** change spacing/radii/icon sizes — the slightly larger icon-to-text ratio is intended
  (Linear-dense).

**Patterns to follow:**

- Token definitions in `packages/ui/src/theme.css` `@theme inline`; the `text-*` scale table in
  `DESIGN.md` §3 stays the single source of truth — keep table and tokens in lockstep.

**Test scenarios:**

- Test expectation: none — pure token/styling change with no behavioral surface. Existing component
  tests assert text _content_, not font-size, so they must stay green; verification is visual.

**Verification:**

- `pnpm typecheck` / `lint` / `build` green; touched-file `prettier` clean.
- Dark-mode screenshots of board, card face, card detail drawer, **card context menu**, and sidebar:
  every surface is proportionally denser, nothing clips/overflows, badges/counts/mono ids stay
  legible, no line looks cramped.
- `grep` confirms no stale old-size hardcoded px text remains; `DESIGN.md` §3 matches the new tokens.

---

- [ ] **Unit 12.2: Context menu — uniform item shape + canonical entity glyphs + project-icon rule**

**Goal:** Give every card context-menu item the same shape and replace the Priority/Project colored
dots with the app's canonical glyphs; write the project-icon convention into `DESIGN.md`.

**Requirements:** R3, R4, R5

**Dependencies:** None (independent of 12.1; do before 12.3 to set the shape baseline).

**Files:**

- Modify: `apps/web/components/card/card-context-menu.tsx`
  - Priority sub-trigger + each priority radio item: replace `span.size-2.5.rounded-full` with
    `<PriorityIcon level={p} />` (import from `./priority-badge`).
  - Project radio items: replace the dot with `<Box className="size-3.5" style={{ color: p.color }} />`.
  - Project **sub-trigger**: add a leading `<Boxes className="size-3.5 text-fg-faint" />` (matches
    the sidebar "All projects" affordance).
  - "No project" radio: add a leading untinted `<Box className="size-3.5" />`.
  - Confirm all leading glyphs are `size-3.5` (14px) so `itemBase`'s `gap-2` aligns text edges.
  - Update imports (`Box`, `Boxes` from `lucide-react`; `PriorityIcon`); drop any now-unused.
- Modify: `docs/design/DESIGN.md` — add **§7.3 Entity glyphs (binding)**: status → `StatusIcon`;
  priority → `PriorityIcon`; **project → lucide `Box` tinted with `project.color`** (never a bare
  colored dot), `Boxes` for all/multiple, untinted `Box` for none. Add a **menu/list item shape
  convention**: uniform 14px (`size-3.5`) leading-icon slot, `text-base`, `gap-2`, every row carries
  a leading glyph.
- Modify (test): `apps/web/components/card/card-context-menu.test.tsx`
- Doc: `docs/units/UNIT-12.2-context-menu-shape-project-icons.md`

**Approach:**

- Query the DOM tree once open to prove glyphs exist rather than asserting exact SVG markup (keeps
  the test resilient). Radix radio items expose `role="menuitemradio"`.
- Keep all existing behavior (setStatus/setPriority/setProject wiring) byte-for-byte; this unit only
  swaps the leading visuals and adds missing ones.

**Patterns to follow:**

- `apps/web/components/card/priority-select.tsx` (uses `PriorityIcon`), `project-select.tsx` /
  `project-chip.tsx` / `board/project-list.tsx` (`Box` tinted, `Boxes` for all, untinted `Box` for
  none). §7.1 Iconography binding rule (the new §7.3 sits alongside it).

**Test scenarios:**

- Happy: menu opens with the existing item set (`Open`, `Status`, `Priority`, `Project`,
  `Copy link`, `Archive`, `Delete`) — existing assertions stay green.
- Happy: the Priority sub-trigger and each priority radio render a `PriorityIcon` SVG (assert an
  `svg` is present in the row), and no `rounded-full` dot span remains for priority.
- Happy: each project radio renders a `Box` icon; the "Project" sub-trigger and "No project" render a
  leading icon; no `rounded-full` dot span remains for projects.
- Edge: a project with a custom color renders its `Box` with `style.color` equal to that color.
- Behavior preserved: selecting a priority radio still calls `setPriority`; selecting a project radio
  still calls `setProject` (id / null) — assert the card mutates via `getCard`.
- Visual (dark mode): all rows' text left-edges align; leading glyphs are a uniform 14px.

**Verification:**

- Tests green; `grep` in `card-context-menu.tsx` shows no `rounded-full` dot for priority/project.
- Dark-mode screenshot: menu items share one shape, projects show tinted `Box`, priority shows the
  bar glyph. `DESIGN.md` §7.3 present and states the project rule.

---

- [ ] **Unit 12.3: "Mark done" / "Mark not done" toggle quick action**

**Goal:** One-click completion from the right-click menu — a top-level toggle that flips the card to
Done, or back to Todo when already done.

**Requirements:** R1

**Dependencies:** Unit 12.2 (same file; author the new item to the established shape).

**Files:**

- Modify: `apps/web/components/card/card-context-menu.tsx` — add a top-level `ContextMenuItem`
  immediately after `Open` (before the Status submenu):
  - When `!isDoneStatus(card.status)`: label **"Mark done"**, `onSelect` →
    `actions.setStatus(card.id, Status.Done)`, leading glyph `<StatusIcon variant="done"
color={STATUS_META[Status.Done].color} />`.
  - When done: label **"Mark not done"**, `onSelect` → `actions.setStatus(card.id, Status.Todo)`,
    leading glyph `<StatusIcon variant="todo" color={STATUS_META[Status.Todo].color} />`.
  - Import `isDoneStatus`, `Status` from `@boardly/domain`.
- Modify (test): `apps/web/components/card/card-context-menu.test.tsx`
- Modify: `docs/design/DESIGN.md` §8 — one line noting the card context-menu's mark-done/undone
  quick action.
- Doc: `docs/units/UNIT-12.3-mark-done-quick-action.md`

**Approach:**

- Derive the label/target from `card.status` during render (no local state — "derive, don't
  synchronize"). Route through `setStatus` so an agent gets the same capability (agent-native).

**Patterns to follow:**

- The existing top-level `ContextMenuItem`s (`Open`, `Copy link`, `Archive`) for structure; the
  Status submenu's `StatusIcon` usage for the glyph; `isDoneStatus` from `packages/domain/src/status.ts`.

**Test scenarios:**

- Happy: on a fresh (non-done) card, the menu shows **"Mark done"**; clicking it sets
  `getCard(...).status === Status.Done`.
- Happy: on a card already in Done, the menu shows **"Mark not done"** (and not "Mark done");
  clicking it sets status to `Status.Todo`.
- Edge: label is derived from current status — rendering with a done card shows the undone label,
  a non-done card shows the done label.
- Integration: the mutation goes through the command layer (verify via `getCard` after click, as the
  existing archive/delete tests do — proves it's not a UI-only toggle).
- a11y: the item is keyboard-reachable, has a visible text label, and its `StatusIcon` is
  `aria-hidden`.

**Verification:**

- Tests green; typecheck/lint/build green.
- Dark-mode screenshot: "Mark done" sits just under "Open" with the Done status glyph; on a done
  card it reads "Mark not done"; toggling updates the card's column live.

## System-Wide Impact

- **Interaction graph:** The `--text-*` tokens (Unit 12.1) are consumed on **every** screen — the
  blast radius is the whole app, so screenshot the densest surfaces (sidebar, card face, badges,
  context menu). Units 12.2/12.3 are localized to the card right-click menu.
- **API surface parity / agent-native:** Mark-done reuses the same `setStatus` command an agent
  calls — no UI-only completion path is introduced; parity preserved. No new commands or tools.
- **State lifecycle risks:** None — no persistence, schema, or migration changes. "Mark not done"
  intentionally forgets prior status (returns to Todo).
- **Unchanged invariants:** Command layer, Yjs schema, Status/Priority submenu behavior, card-face
  layout, and spacing/radii tokens are all unchanged. Only glyphs, font sizes, and one new menu item
  change. Existing context-menu tests must remain green (item set unchanged apart from the added
  toggle).
- **Integration coverage:** Unit 12.3's command-routing is proven by reading `getCard` after a click
  (mirrors the existing archive/delete tests), not by mocking the action.

## Risks & Dependencies

| Risk                                                                                            | Mitigation                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Font shrink causes clipping/overflow or cramped lines in dense areas (badges, counts, sidebar). | Nudge line-heights proportionally; dark-mode screenshot the densest screens; adjust per-site if a line looks tight. |
| Hardcoded `text-[Npx]` sweep misses a site or over-shrinks the lone `text-[10px]` micro-label.  | `grep` guard for stale old sizes; decide `10→9` per-site on legibility, else leave.                                 |
| Context-menu test becomes brittle by asserting exact SVG markup.                                | Assert glyph _presence_ (an `svg` in the row) / `role="menuitemradio"` / the color style, not markup shape.         |
| Units 12.2 and 12.3 edit the same file and could churn/conflict.                                | Sequence 12.2 → 12.3; commit each separately.                                                                       |
| `format:check` is repo-wide red on untouched files.                                             | Only prettier the files this plan touches; never `prettier --write .` (see `boardly-gate-drift`).                   |

## Documentation / Operational Notes

- Each unit ships its `docs/units/UNIT-12.x-*.md` and a `DESIGN.md` update in the **same commit**
  (satisfies the soft pre-commit docs hook). Commit subjects carry the `UNIT-12.x` id.
- `DESIGN.md` changes: §3 type scale (12.1), new §7.3 entity-glyph + menu-item shape rule (12.2),
  §8 card context-menu note (12.3).
- No rollout/migration/monitoring concerns — client-only visual/interaction changes.

## Sources & References

- Menu: `apps/web/components/card/card-context-menu.tsx`,
  `packages/ui/src/components/context-menu.tsx`
- Canonical glyphs: `apps/web/components/card/priority-badge.tsx` (`PriorityIcon`),
  `apps/web/components/card/project-chip.tsx` / `project-select.tsx`,
  `apps/web/components/board/project-list.tsx`, `packages/ui/src/components/status-icon.tsx`
- Domain: `packages/domain/src/status.ts` (`Status`, `STATUS_META`, `isDoneStatus`)
- Tokens/type: `packages/ui/src/theme.css`, `apps/web/app/globals.css`, `docs/design/DESIGN.md`
  §3 / §7.1
- Tests: `apps/web/components/card/card-context-menu.test.tsx`
