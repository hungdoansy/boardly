# UNIT 13: Column header (count beside name + add "+") and easy drop onto empty columns

- **Plan:** `docs/plans/2026-07-17-001-feat-column-header-and-empty-drop-plan.md`
- **Status:** done
- **Requirements:** R5 (core board), R8 (keyboard-first), R2 (performant) — plan R1–R7
- **Screenshot:** capture pending — verified live in-session (dark): the header "+" opens the inline
  composer, and mid-drag a hovered **empty** column showed the accent ring + expanded dashed drop
  zone, with the dropped card landing in that column. Add
  `docs/units/screenshots/UNIT-13-empty-column-drop-dark.png` on the next manual pass.

## What changed

Two related column-UI changes, shipped as two commits.

### 1. Header layout — count beside name, add-card "+" on the right (commit 1)

- `apps/web/components/board/column.tsx` — `BoardColumn` header is now `[status icon → name →
count]` grouped on the left (in a `min-w-0 flex-1` wrapper so the name truncates), with an add-card
  **"+"** icon button (`lucide-react` `Plus`) pushed to the right (`shrink-0`) where the count used to
  sit. New prop `onAddCard?: () => void` (renders the "+"; omit to hide it). The `data-nav="column"`
  focus target and `data-column-id` are unchanged, so keyboard nav is unaffected.
- The header "+" opens the column's **existing inline composer** (the same input the footer quick-add
  and the `c` shortcut open) — not a new dialog. The footer composer is unchanged.

### 2. Easy drop onto empty (collapsed) columns (commit 2)

- `apps/web/components/board/dnd.tsx` — `StatusColumn` now reads `isOver` from `useDroppable` and
  passes it to `BoardColumn`. `BoardDndProvider`'s `DndContext` gains
  `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`.
- `apps/web/components/board/column.tsx` — while `isOver`, the `<section>` swaps its subtle border for
  an accent ring (`ring-2 ring-[var(--accent)]`, border made transparent to keep layout stable) and
  sets `data-over`. When `isOver && count === 0`, the body renders an `aria-hidden` drop-zone
  placeholder (`data-drop-zone`) — a dashed accent border + `--bg-selected` tint, `min-h-[76px]` —
  above `{children}`, so a collapsed empty column becomes a clear, comfortable target. Populated
  hovered columns get the ring only (their cards already fill the body).

### Composer open-state wiring (commit 1)

- `apps/web/components/board/column-composer-context.ts` (new) — a tiny per-column
  `ColumnComposerContext { open, setOpen }` + `useColumnComposer()` hook. `null` when no provider is
  present.
- `apps/web/components/board/dnd.tsx` — `StatusColumn` owns `useState` for the composer open flag and
  wraps its subtree in the provider (it is the one place that renders both the header, via
  `BoardColumn`, and the footer composer, via `children`). It passes `onAddCard={() => setOpen(true)}`
  to `BoardColumn`.
- `apps/web/components/card/card-composer.tsx` — `CardComposer` consumes the context to drive its
  `adding` open-state when present, falling back to internal `useState` otherwise (stays reusable and
  testable standalone). The footer quick-add button keeps `data-nav-composer`, so keyboard `c`
  (`keyboard-nav.tsx` DOM-clicks it) still opens the same composer.

## Why (decisions)

- **Header "+" reuses the inline composer via a scoped context, not lifted global state or DOM
  clicks.** Header and composer live in sibling subtrees separated by the `children` boundary, so a
  per-column context is the clean bridge (CLAUDE.md §3: scoped subscriptions, no prop-drilling) and
  keeps `BoardColumn`/`CardComposer` presentational + independently testable. Keeping
  `data-nav-composer` on the footer button means the `c` shortcut path is untouched.
- **`MeasuringStrategy.Always` for droppables.** The hovered empty column grows when its drop zone
  appears; dnd-kit's default measures droppable rects once at drag start, which would freeze the
  collapsed rect so the cursor moving into the grown zone loses `isOver` and flickers. `Always`
  re-measures each frame so the expanded zone is fully hit-testable. Growth is downward-only under a
  stationary/descending cursor and columns are laid out horizontally (vertical growth never shifts
  neighbors), so this does not cause target oscillation. Cost is negligible at 8 columns.
- **Only the hovered column reacts, instantly.** Per the plan decision (and DESIGN §8 "do not animate
  board/list-wide reflows"), the drop zone appears without a height/layout transition and other
  columns stay collapsed — no board-wide movement on drag start. Reduced-motion is inherently
  satisfied (no motion introduced).
- **"Empty" = filtered `count === 0`.** Reuses the count already threaded into `BoardColumn` (the same
  value the header shows and the hide-empty toggle uses), so the drop zone is consistent with them.

## Design (per DESIGN.md)

- Header order and the "+" affordance: DESIGN §299 (App surfaces → Board view). Drag feedback (ring +
  empty-column drop zone, instant, hovered-only): DESIGN §8 Motion (line ~191). Tokens only —
  `--accent`, `--bg-selected`, `--radius-md`, `--dur-fast`; "+" mirrors the composer icon-button
  styling (hover `bg-hover`, accent focus ring). Icon is an SVG (`lucide-react`), never a glyph
  (DESIGN §7.1).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` then
`pnpm --filter @boardly/web test` (227 pass; new tests in `column.test.tsx`):

- **Header** — count renders inside the `<header>` next to the name; the header add-card button opens
  the column's inline composer (`textbox "New card title"` appears); `c` shortcut still opens the
  composer after the header rework.
- **Drop feedback** — `BoardColumn` rendered with `isOver && count===0` shows `[data-drop-zone]` and
  `section[data-over]`; not hovered → neither; hovered + populated → `data-over` (ring) but no zone.

Gates: `pnpm --filter @boardly/web typecheck`, `lint`, and `build` (static export) all green.

**Live (dark, dev server) — verified in-session against the seeded demo board:**

- Header shows `icon · name · count` grouped left with the "+" on the right across all 8 columns; the
  Duplicate header "+" opened the inline "Card title…" composer.
- Emptied a column, then held a pointer drag over it: the column showed the accent ring **and** the
  expanded dashed drop zone below the drag preview; completing the drop moved the card into that
  previously-empty column (Done → Duplicate confirmed via the DOM). Demo board re-seeded afterward.

## Follow-ups / known gaps

- No dedicated Playwright spec was added; the drag-onto-empty flow is covered by component tests for
  the render logic plus a manual dark-mode live check (the existing e2e suite hits the shared API's
  login rate limit in batch — see `boardly-e2e-verification`). A focused Playwright case can be added
  later if this area regresses.
- Drop-zone `min-h-[76px]` is tuned by eye to ≈ one card; revisit if card density changes.
- Swimlanes (grouped view) columns are unchanged — read/triage surface, out of scope.
