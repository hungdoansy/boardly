---
title: 'feat: Column header (count beside name + add "+") and easy drop onto empty columns'
type: feat
status: active
date: 2026-07-17
---

# feat: Column header (count beside name + add "+") and easy drop onto empty columns

## Overview

Two related board-column UI changes, shipped together:

1. **Header layout.** Move the per-column ticket **count** to sit immediately next to the column
   name, and add a **"+" add-card button** in the count's former far-right position. The "+" opens
   the column's existing inline composer; the footer composer stays.
2. **Empty-column drop target.** Empty columns collapse to ~72px, so dragging a card onto one is a
   tiny, invisible target. When a drag is over a column, **highlight that column and expand its body
   into a clear "drop here" zone** so the card can be dropped comfortably under the highlighted
   column. Only the hovered column reacts (columns otherwise stay collapsed).

Both are visual/interaction changes to the fixed Linear-style status columns and must satisfy
`docs/design/DESIGN.md` (dark mode first).

## Problem Frame

Columns are the eight fixed statuses (`board-view.tsx` → `StatusColumn` → `BoardColumn`). The card
list uses `items-start`, so a column with no matching cards shrinks to header + `min-h-9` body +
composer. Today:

- The count is pushed to the far right of the header (`flex-1` on the name button), so it reads as
  disconnected from the name, and there is no header-level add affordance (add-card lives only in the
  footer composer and the `c` keyboard shortcut).
- An empty column is a small box with no drag feedback. `StatusColumn` is already a droppable, so a
  drop _technically_ resolves the status, but the target is hard to see and hard to hit — there is no
  `isOver` highlight and nothing tells the user "drop here."

## Requirements Trace

- R1. In the column header, the count renders immediately adjacent to the column name (icon → name →
  count), left-aligned as a group.
- R2. A "+" add-card button renders at the right end of the header (the count's old position); it is
  an SVG icon button (`lucide-react`, never a glyph) with an accessible label.
- R3. Clicking the header "+" opens the column's inline add-card composer (same input the footer
  quick-add opens). The footer composer remains unchanged and functional.
- R4. While a card drag is over a column, that column is visibly highlighted and — when it has no
  cards — its body expands into a clear, accent-tinted drop zone the user can drop into.
- R5. Dropping a card onto the highlighted (empty) column applies that column's status and appends
  the card, exactly as today (no change to the move/ord semantics).
- R6. Only the hovered column expands/highlights; other columns stay as-is. No board-wide layout
  animation (DESIGN §6).
- R7. Existing behaviors are preserved: keyboard `c` opens the composer, roving arrow-key nav still
  lands on column headers and cards, columns remain non-editable/non-reorderable, `prefers-reduced-motion`
  is respected.

## Scope Boundaries

- **Not** changing column set, order, status semantics, or the move/ord math (`lib/dnd.ts`,
  `moveCard`) — the append-to-empty path already exists and is unit-tested.
- **Not** changing the swimlanes (grouped) view columns (`swimlanes.tsx`) — they are a read/triage
  surface with no composer and no card drag; out of scope.
- **Not** adding a second add-card path in the composer (the header "+" reuses the existing inline
  composer; no new dialog).
- **Not** touching the list view or card detail.

## Context & Research

### Relevant Code and Patterns

- `apps/web/components/board/column.tsx` — `BoardColumn`, presentational. Header is
  `[status icon + name (flex-1)] [count]`; body is `<div class="flex min-h-9 flex-1 ... p-2">{children}</div>`.
  This is where the header restructure and the drop-zone/highlight rendering land.
- `apps/web/components/board/dnd.tsx` — `BoardDndProvider` (`DndContext`, `closestCorners`,
  `DragOverlay`), `SortableCard`, and `StatusColumn` (the `useDroppable({ id: status })` wrapper that
  renders `BoardColumn`). `isOver` and the composer-open state are wired here.
- `apps/web/components/board/column-cards.tsx` — renders the `SortableContext` of cards plus the
  footer `CardComposer`. Child of `StatusColumn` (passed as `children`), so it must consume shared
  state via context rather than props.
- `apps/web/components/card/card-composer.tsx` — owns the `adding` open state today; the collapsed
  quick-add `<button data-nav-composer>` (lucide `Plus`) and the expanded `<input data-nav-composer>`.
  Made controllable so the header "+" and keyboard `c` can open the same composer.
- `apps/web/components/board/keyboard-nav.tsx` — `openComposer()` finds `[data-nav-composer]` in the
  column and clicks it (collapsed) or focuses it (input). Header "+" must not break this; the footer
  quick-add must keep `data-nav-composer` and keep opening the composer.
- `apps/web/components/board/board-view.tsx` — passes `count={counts[status] ?? 0}` per column; the
  filtered `counts` are the source of truth for "empty" (count === 0).
- `apps/web/components/card/card-composer.tsx` + `column.tsx` icon-button styling (`grid size-7
place-items-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-hover hover:text-fg
focus-visible:ring-2 focus-visible:ring-[var(--accent)]`) is the pattern to mirror for the header "+".

### Institutional Learnings

- `docs/units/UNIT-1.6-drag-and-drop.md` — drag feedback is deliberately lightweight (source dims,
  compact `DragOverlay`, drop settles instantly, **no list/layout animation**). The empty-column
  affordance must stay within that budget.
- Project memory `boardly-board-collapse` — columns are the 8 fixed statuses; drag applies status
  immediately; the `showEmptyColumns` toggle already hides zero-card columns (so the drop-zone work
  matters chiefly when "show empty columns" is on).
- `boardly-e2e-verification` — run Playwright against an already-running dev server via a no-webServer
  scratch config; the shared API's login rate limit causes false batch-signUp failures.

### External References

None — this is well-patterned local work (dnd-kit already in use, column primitives established). No
external research performed.

## Key Technical Decisions

- **Header "+" opens the existing inline composer via a per-column context, not a new dialog and not
  fully-lifted state.** `StatusColumn` (which renders both the header, via `BoardColumn`, and the
  body's `CardComposer`, via `children`) owns a small `open`/`setOpen` state and provides it through a
  scoped `ColumnComposerContext`. `BoardColumn` gets an `onAddCard` prop that calls `setOpen(true)`;
  `CardComposer` consumes the context to control its open state, falling back to internal state when
  no provider is present (keeps it reusable/unit-testable standalone). Rationale: header and composer
  live in sibling subtrees separated by the `children` boundary, so a scoped context is the clean
  bridge (CLAUDE.md: scoped subscriptions, no prop-drilling). Keeping the footer quick-add button with
  `data-nav-composer` means keyboard `c` (which DOM-clicks it) keeps working untouched.
- **Empty-column drop uses `isOver` for feedback + `MeasuringStrategy.Always` for hit-testing.**
  `useDroppable` in `StatusColumn` already exposes `isOver`; pass it to `BoardColumn`. When `isOver`,
  add an accent ring to the column; when `isOver && count === 0`, render an expanded accent-tinted
  drop-zone placeholder in the body. Because the placeholder grows the column's height on hover, set
  `DndContext` `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` so the droppable
  rect re-measures to include the expanded zone — otherwise dnd-kit's default (measure once at drag
  start) freezes the collapsed rect and moving the cursor into the expanded area would drop `isOver`
  and flicker. Growth is downward-only under a stationary/descending cursor and columns are laid out
  horizontally (vertical growth never shifts neighbors), so `Always` does not cause target
  oscillation here.
- **No height animation on expand.** The drop zone appears instantly (optionally a `--dur-fast`
  opacity/background fade only) — never an animated `height`/layout transition — per DESIGN §6/§8 and
  UNIT-1.6's lightweight-feedback rule. Respect `prefers-reduced-motion`.
- **"Empty" = filtered `count === 0`.** Reuse the count already threaded into `BoardColumn`; do not
  recompute. This keeps the drop zone consistent with the header count and the hide-empty toggle.

## Open Questions

### Resolved During Planning

- Header "+" behavior / footer composer fate → **opens the inline composer; footer composer stays**
  (user decision).
- Drag treatment for collapsed empty columns → **only the hovered column expands/highlights** (user
  decision), not a board-wide expand.
- Making `CardComposer` open externally without breaking keyboard `c` → controlled-via-context with
  internal fallback; footer quick-add keeps `data-nav-composer`.

### Deferred to Implementation

- Exact drop-zone min-height and paddings (target ~72–96px; tune to match a single card's footprint so
  the appended card lands where the zone showed). Pick during implementation against the dark
  screenshot.
- Whether a subtle `isOver` ring is also worth showing on _populated_ columns, or only the
  accent-tinted expand on empty ones. Default: ring on any hovered column, expanded zone only when
  empty; confirm visually.
- Whether `MeasuringStrategy.Always` shows any measurable jank at 8 columns; if so, fall back to
  expanding all empty columns once at drag start (the rejected UX) or a bespoke frozen-rect padding.
  Verify in the Playwright pass.

## Implementation Units

- [x] **Unit 1: Column header — count beside name + add-card "+" opening the inline composer**

**Goal:** Restructure the column header to `icon → name → count` (grouped left) with an SVG "+"
add-card button at the right that opens the column's inline composer; footer composer unchanged.

**Requirements:** R1, R2, R3, R7

**Dependencies:** None

**Files:**

- Modify: `apps/web/components/board/column.tsx` (header layout; add `onAddCard?: () => void`; render
  `lucide-react` `Plus` icon button when provided; group name+count in a `min-w-0 flex-1` wrapper so
  the name truncates and "+" stays `shrink-0` on the right)
- Modify: `apps/web/components/board/dnd.tsx` (`StatusColumn` owns `const [composerOpen, setComposerOpen]`,
  wraps its subtree in `ColumnComposerContext.Provider`, passes `onAddCard={() => setComposerOpen(true)}`
  to `BoardColumn`)
- Create: `apps/web/components/board/column-composer-context.ts(x)` (tiny context: `{ open, setOpen }`,
  plus a hook that returns a safe no-op/internal fallback when no provider)
- Modify: `apps/web/components/card/card-composer.tsx` (consume the context to control `adding`;
  internal `useState` fallback preserved; keep `data-nav-composer` on both the quick-add button and
  the input; close still resets draft)
- Modify/Create: `apps/web/components/board/column.test.tsx` (header assertions) and, if the composer
  wiring warrants it, a focused test in the same file or `card-composer.test.tsx`

**Approach:**

- Header becomes: `<div class="flex min-w-0 flex-1 items-center gap-1.5">[nav button: icon + truncated
name][count]</div>` then `{onAddCard && <button class="…icon…" aria-label="Add card">Plus</button>}`.
  Keep `data-nav="column"`/`data-column-id` on the name button so keyboard nav is unaffected.
- Count keeps `text-xs tabular-nums text-fg-faint`, now `shrink-0` directly after the name.
- The "+" mirrors the composer's icon-button classes; `title`/`aria-label` "Add card".
- `CardComposer`: when the context is open, render the input; opening is idempotent (header "+",
  footer "+", and keyboard `c` all funnel to the same open state). Footer render is otherwise
  identical.

**Patterns to follow:**

- Icon-button styling from `card-composer.tsx` (quick-add) and the focus-ring/hover tokens in
  `column.tsx`.
- Context-as-scoped-bridge (avoid prop-drilling) per CLAUDE.md §3.

**Test scenarios:**

- Happy path: header renders status icon, name, and count as an adjacent left group (count text node
  is a sibling immediately following the name button).
- Happy path: an "Add card" control renders in the header, is a `<button>` (role button) with an
  accessible name, and its glyph is an SVG (`svg` present, no Unicode "+" text node).
- Happy path: clicking the header "Add card" reveals the inline composer input
  (`getByRole('textbox', { name: /new card title/i })` appears); typing + Enter calls the create
  action for that column's status.
- Integration: the footer quick-add still opens the same composer (only one composer input per column
  at a time); closing (Escape/blur) hides it.
- Regression: pressing `c` while a column header is focused still opens that column's composer
  (`keyboard-nav` DOM-click of `[data-nav-composer]` unaffected).
- Edge case: a very long status/column name truncates (`truncate`) without pushing the "+" out of the
  header.
- Invariant: still no "add column" control and headers remain non-editable (existing `column.test.tsx`
  assertions keep passing).

**Verification:**

- `pnpm --filter @boardly/web test` green; header visually matches `icon name count … +` in dark mode;
  keyboard `c` and footer add still work.

- [ ] **Unit 2: Empty-column drop target — highlight the hovered column and expand its body into a drop zone**

**Goal:** When a card drag is over a column, highlight it; when that column is empty, expand its body
into a clear accent-tinted "drop here" zone so the card can be dropped under the highlighted column.

**Requirements:** R4, R5, R6, R7

**Dependencies:** Unit 1 (same files; keeps the header change and drop-zone change in one cohesive
column update). Can be a separate commit.

**Files:**

- Modify: `apps/web/components/board/dnd.tsx` (`StatusColumn`: read `isOver` from `useDroppable`, pass
  to `BoardColumn`; `BoardDndProvider`: add `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`
  and import `MeasuringStrategy` from `@dnd-kit/core`)
- Modify: `apps/web/components/board/column.tsx` (accept `isOver?: boolean`; when `isOver`, add an
  accent ring to the `<section>`; when `isOver && count === 0`, render an expanded drop-zone
  placeholder — dashed accent border + `--bg-selected` tint + min-height — above `{children}`; no
  height animation; guard with `prefers-reduced-motion` for any fade)
- Modify: `apps/web/components/board/column.test.tsx` (component-level `isOver` prop assertions)
- Modify: `apps/e2e/tests/board.spec.ts` (or `apps/e2e/tests/drag-focus.spec.ts`) — pointer-drag onto
  an empty column asserts the drop zone appears and the drop applies status + appends
- Add: `docs/units/screenshots/UNIT-13-empty-column-drop-dark.png` (dark, mid-drag over an empty
  column showing the highlighted zone)

**Approach:**

- `StatusColumn`: `const { setNodeRef, isOver } = useDroppable(...)` → `<BoardColumn … dndRef={setNodeRef}
isOver={isOver} />`.
- `BoardColumn`: section gets `ring-1 ring-[var(--accent)]` (or ring-2 to match focus token) only when
  `isOver`. Body: if `isOver && count === 0`, render `<div aria-hidden class="… border border-dashed
border-[var(--accent)] bg-[var(--bg-selected)] min-h-[72px] rounded-[var(--radius-md)]" />` before
  the composer. Populated columns show only the ring (cards already fill the body).
- `MeasuringStrategy.Always` ensures the grown column is fully hit-testable so the cursor can move into
  the expanded zone and still resolve this column as the drop target; drop semantics are unchanged
  (`onDragEnd` → `planMove` appends when `overId` is null).

**Patterns to follow:**

- UNIT-1.6 lightweight drag feedback (dim source, instant settle, no layout animation).
- Selected-row/link-highlight token pairing (`--bg-selected` + accent) used elsewhere (card selection,
  UNIT-P10 link highlight) for a consistent "active target" look.
- `boardly-e2e-verification` no-webServer scratch-config pattern for the Playwright drag test.

**Test scenarios:**

- Happy path (component): `BoardColumn` with `isOver` and `count === 0` renders the drop-zone element;
  without `isOver` it does not; with `isOver` the section carries the accent ring class.
- Edge case (component): `isOver` with `count > 0` shows the ring but **no** expanded placeholder.
- Integration (Playwright, dark): pick up a card and drag over an empty column → the column highlights
  and shows the drop zone; release → the card moves to that status and is appended;
  **reload → the move persists** (offline IndexedDB).
- Integration (Playwright): dragging over the expanded zone (cursor moved down into the grown area)
  keeps the column highlighted and does not flicker/deselect (validates `MeasuringStrategy.Always`).
- Regression: dropping onto a **populated** column still inserts relative to the over-card (existing
  `dnd.test.ts` / behavior unaffected); keyboard drag (Space/Arrow/Space) still moves a card into an
  empty column.
- Accessibility: with `prefers-reduced-motion`, no motion beyond an instant appearance; the drop zone
  is `aria-hidden` (decorative) and does not add a spurious nav/focus target.

**Verification:**

- `pnpm --filter @boardly/web test` + e2e drag spec green; dark screenshot reviewed against DESIGN.md;
  drop onto empty column is obvious and comfortable, no jitter; other columns unchanged during drag.

## System-Wide Impact

- **Interaction graph:** header "+" and footer quick-add and keyboard `c` now all open one per-column
  composer (context-controlled). Verify no double-open / stuck-open across the three triggers.
- **State lifecycle:** composer open state moves from `CardComposer`-internal to `StatusColumn`-owned
  context; ensure closing (Escape/blur/submit-then-idle) still resets both open flag and draft, and
  that switching focus between columns doesn't leak an open composer.
- **API surface parity:** none — no command-layer or agent-tool change; drag still routes through
  `moveCard` (R13 parity intact).
- **Unchanged invariants:** column set/order/status semantics, `moveCard`/`lib/dnd.ts` math,
  `showEmptyColumns` toggle, roving keyboard nav (`data-nav-*` markup), and the swimlanes view are all
  unchanged. `MeasuringStrategy.Always` is a rendering/measuring config only.

## Risks & Dependencies

| Risk                                                       | Mitigation                                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expand-on-hover jitter (target grows/shrinks under cursor) | `MeasuringStrategy.Always` + downward-only vertical growth in a horizontal layout; validate with the dedicated Playwright "no flicker" scenario; documented fallback (expand-all-at-drag-start) if needed |
| `MeasuringStrategy.Always` perf cost                       | Only 8 columns; measure in the drag Playwright pass; acceptable at this scale (UNIT-1.6 notes smooth drag at current volumes)                                                                             |
| Composer open-state regression (keyboard `c`, footer add)  | Keep `data-nav-composer` on the footer quick-add + input; explicit regression test; context has internal fallback                                                                                         |
| Header "+" adds an unintended keyboard/roving nav stop     | "+" is a plain `<button>` without `data-nav`; confirm `readLayout`/`moveFocus` still only see `data-nav="column"`/`"card"`                                                                                |
| Undocumented visual change (repo docs-discipline hook)     | Update `DESIGN.md` §299 (header order + "+" affordance) and the drag-feedback note in §8/§191; ship the UNIT-13 doc in the same commits                                                                   |

## Documentation / Operational Notes

- **DESIGN.md** — update the Board-view column description (§299) to `status icon + name + live count,
add-card "+" pushed right`, and note the hovered-column highlight + empty-column expand-to-drop-zone
  in the drag-feedback/motion section (§8 / line ~191). These are binding visual changes, so the doc
  edit must be in the same commit as the code (soft pre-commit hook).
- **Unit doc** — create `docs/units/UNIT-13-column-header-and-empty-drop.md` covering both units (what
  changed, why, how it works, how to verify, follow-ups), with the dark screenshot. Create it in
  Unit 1's commit and extend it (drop-zone section + screenshot) in Unit 2's commit so every
  source-changing commit stages a doc surface. Pick the final `UNIT-<id>` to match repo numbering
  (latest is UNIT-12.3; UNIT-13 suggested).
- No migration, rollout, or data impact.

## Sources & References

- Related code: `apps/web/components/board/{column,dnd,column-cards,board-view,keyboard-nav}.tsx`,
  `apps/web/components/card/card-composer.tsx`, `apps/web/lib/dnd.ts`
- Related docs: `docs/units/UNIT-1.6-drag-and-drop.md`, `docs/units/UNIT-1.4-columns-ui.md`,
  `docs/design/DESIGN.md` (§2 statuses, §8 motion, App-surfaces §299)
- Prior plans: `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md`
