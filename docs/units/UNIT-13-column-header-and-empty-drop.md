# UNIT 13: Column header (count beside name + add "+") and easy drop onto empty columns

- **Plan:** `docs/plans/2026-07-17-001-feat-column-header-and-empty-drop-plan.md`
- **Status:** in progress — Unit 1 (header) done; Unit 2 (empty-column drop) follows in the next commit
- **Requirements:** R5 (core board), R8 (keyboard-first) — plan R1–R3, R7

## What changed (Unit 1 — header: count beside name, add-card "+")

- `apps/web/components/board/column.tsx` — `BoardColumn` header is now `[status icon → name →
count]` grouped on the left (in a `min-w-0 flex-1` wrapper so the name truncates), with an add-card
  **"+"** icon button (`lucide-react` `Plus`) pushed to the right (`shrink-0`) where the count used to
  sit. New prop `onAddCard?: () => void` renders the "+" (omit to hide it). The `data-nav="column"`
  focus target and `data-column-id` are unchanged, so keyboard nav is unaffected.
- The header "+" opens the column's **existing inline composer** (the same input the footer quick-add
  and the `c` shortcut open) — not a new dialog. The footer composer is unchanged.

### Composer open-state wiring

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

## Design (per DESIGN.md)

- Header order and the "+" affordance: DESIGN §299 (App surfaces → Board view). Tokens only; "+"
  mirrors the composer icon-button styling (hover `bg-hover`, accent focus ring). Icon is an SVG
  (`lucide-react`), never a glyph (DESIGN §7.1).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"` then
`pnpm --filter @boardly/web test` (new header tests in `column.test.tsx`): count renders inside the
`<header>` next to the name; the header add-card button opens the column's inline composer; the `c`
shortcut still opens the composer after the header rework.

Verified live (dark): all 8 column headers show `icon · name · count` grouped left with the "+" on the
right; clicking a header "+" opened the inline "Card title…" composer.

## Follow-ups / known gaps

- **Unit 2 (next commit):** hovered-column accent ring + expanded drop zone for empty/collapsed
  columns on drag-over (`isOver` + `MeasuringStrategy.Always`).
