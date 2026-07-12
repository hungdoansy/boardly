# UNIT-7.9 — Web board: fixed status columns, drag sets status, show/hide-empty toggle

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 9). Realizes the web-board side of R9/R10/R11 on top of Unit 7 (domain+sync: eight statuses, `status` as the single placement axis, `showEmptyColumns` board-meta) and Unit 8 (commands: `moveCard({toStatus})`, `setShowEmptyColumns`, no column commands).

This restores `@boardly/web` to green after Units 7–8 removed the `Column` type, `Card.columnId`, every sync column op, and all column commands. The board now renders the eight fixed Linear status columns; dragging a card onto a column applies that status; and a synced board-toolbar toggle hides/shows empty columns.

## What changed

- **`apps/web/lib/use-board.ts`** — replaced the column selectors/actions with status-group ones:
  - Removed `useColumns`, `useCardsInColumn`, `useReclaimedCards`, `useColumnActions`, and the `ColumnActions` interface.
  - `useCardCounts()` now returns `Record<Status, number>` (one entry per `STATUS_ORDER` status via `cardsInStatus`), subscribed to `boardCards`.
  - Added `useCardsInStatus(status)` (replaces `useCardsInColumn`).
  - Added `useShowEmptyColumns()` / `useSetShowEmptyColumns()` — read the board-meta flag (`getBoard(doc).showEmptyColumns`, default `true`) and write it via the `setShowEmptyColumns` command.
  - `useCardActions().create` signature changed from `create(columnId, title)` to `create(title, status?)` (a card's column IS its status; omitting `status` defaults to Todo in sync).
- **`apps/web/components/board/board-view.tsx`** — columns are now `STATUS_ORDER` (fixed 8), rendered via `StatusColumn` + `ColumnCards`. Added a board toolbar row with a single "Hide empty columns" / "Show empty columns" toggle wired to the board-meta flag; when off, `visibleStatuses` filters out zero-count statuses. The "Unsorted"/reclaimed bucket and the column-level `SortableContext`/`AddColumn` are gone.
- **`apps/web/components/board/column.tsx`** — `BoardColumn` is now a read-only fixed status column: header shows the `STATUS_META` name + a `StatusIcon` color swatch. Removed the rename input, the delete/menu button, and the WIP-limit editor/`WipBadge`. It keeps a focusable `data-nav="column"` header (so keyboard nav still lands on columns) and `data-nav-column={status}`.
- **`apps/web/components/board/dnd.tsx`** — removed column dragging entirely (no `moveColumn`, no `SortableColumn`). Added `StatusColumn` (a `useDroppable` wrapper around `BoardColumn`, so empty columns still accept drops). `SortableCard` now carries `status` in its drag data and `data-column-id={status}`. `onDragEnd` resolves the destination column's **status** and issues one `moveCard({ cardId, toStatus, afterId, beforeId })` — a drop both moves and re-statuses the card (R10).
- **`apps/web/components/board/column-cards.tsx`** — prop `columnId` → `status`; resolves cards via `useCardsInStatus(status)`; composer calls `actions.create(title, status)`.
- **`apps/web/components/board/swimlanes.tsx`** — the per-lane columns are now `STATUS_ORDER` (filtered by `c.status === status`), labeled from `STATUS_META`. Removed `useColumns` and the `UnsortedCell` (no orphaned cards: every card has a valid status). Still a read/triage view (cross-lane drag remains a follow-up).
- **`apps/web/components/board/list-view.tsx`** — unchanged (already groups/sorts by `status`); compiles now that `@boardly/ui`'s `StatusVariant` covers all eight statuses.
- **`apps/web/components/card/activity.tsx`** — dropped `useColumns`/column-name resolution. The legacy `moved` activity case (no longer produced — `moveCard` logs `status`) renders a generic "Moved"; `status` entries render the `STATUS_META` name as before.
- **`apps/web/components/command-palette/palette.tsx`** — "New card" no longer needs a first column; it calls `actions.create("New card")` (defaults to Todo).
- **`apps/web/lib/use-boards.ts`** — removed `useSeedDefaultBoard`/`DEFAULT_COLUMNS` (the interim Unit-6 column seed). Replaced with `useInitBoardMeta()`: a minimal, idempotent, hydration-gated **meta-only** init (see Why).
- **`apps/web/components/app/workspace-app.tsx`** — `useSeedDefaultBoard()` → `useInitBoardMeta()`.
- **`apps/web/components/board/add-column.tsx`** — **deleted**.
- **`packages/ui/src/components/status-icon.tsx`** — extended `StatusVariant` with `pending` and `duplicate`; `pending` gets a progress pie (started category), `duplicate` renders filled-with-cross (canceled category). Required so the status columns/list rows can render icons for all eight statuses.
- **Tests** — updated all web component/lib tests that seeded a column (`addColumn` + `createCard({columnId})`) to seed by status instead. Rewrote `board/column.test.tsx` to assert the eight fixed columns render in `STATUS_ORDER`, that there is no add-column control and headers are not editable, and that the hide-empty toggle drops zero-card columns and persists the flag to board meta. Rewrote `card/activity.test.tsx` to assert a drag/move produces a `status` timeline entry. Updated `command-palette/palette.test.tsx` to assert "New card" creates in Todo.
- **`apps/e2e/tests/*`** — `helpers.ts` drops `DEFAULT_COLUMNS`/`addColumn`, adds `STATUS_COLUMNS`, and `createBoard` waits for the fixed `Todo`/`Done` columns. `board.spec.ts` asserts the eight columns + no add-column + status placement + the hide-empty toggle. `sync.spec.ts` syncs a card (not a column). `auth`/`a11y`/`list`/`focus-mode`/`search`/`card` specs use the fixed column names ("Todo", "In Progress").

## Why

- **Columns are pure presentation of `STATUS_ORDER`.** There is no add/rename/reorder/WIP path anywhere in the UI (R9). Rendering straight from the domain constant means the board can never drift from the eight statuses, and a brand-new empty doc renders all eight columns with zero extra state.
- **Drop → one `moveCard({toStatus})`.** The drop handler maps the destination column to its status and issues a single command that writes `status` + a between-neighbors `ord`, so a drag both moves and re-statuses in one action (R10). Empty columns are `useDroppable` targets, so dropping into an empty column still resolves a destination status.
- **`showEmptyColumns` toggle in board meta.** The toggle reads/writes the synced board-meta flag (default `true`) via the `setShowEmptyColumns` command, so the preference persists per-user and syncs across devices (R11). The visible-column filter uses the **unfiltered** per-status counts, so hiding empties is about "this status has no cards on the board," independent of the active saved-view filter.
- **Interim seed removed; brand-new-doc meta defaults preserved without seeding columns.** Unit 6's `useSeedDefaultBoard` seeded three user columns; that is gone. A new user boots straight to the eight empty status columns with no column seeding. The one thing the old seed still provided was **non-column board meta** (title + default badge config + empty ticket prefix via `initBoard`). Defaulting those purely in the getters was rejected: badge config can legitimately be emptied by the user (the badge-config editor allows disabling every field), so `boardToPlain` returning `[]` can't be distinguished from "never set" at the getter. The plan's sanctioned fallback — a **minimal, idempotent, meta-only `initBoard`** (guards on `createdAt`; creates no columns), gated on IndexedDB hydration so it never writes over persisted content — is used instead (`useInitBoardMeta`). `showEmptyColumns` itself defaults in the sync getter (`getBool(meta, "showEmptyColumns", true)`), so it needs no seeding.
- **Keyboard nav preserved.** `keyboard-nav.tsx` is DOM-derived (reads `data-nav-column` / `data-column-id` / `data-nav="card"|"column"`), treating the ids as opaque. Keeping those attributes with the status string as the id means arrow/`c`/`e`/`p`/Enter navigation works unchanged against fixed columns.

## How it works

- **Columns**: `BoardView` renders `visibleStatuses.map(status => <StatusColumn status count>{<ColumnCards status/>}</StatusColumn>)`, where `visibleStatuses = showEmptyColumns ? STATUS_ORDER : STATUS_ORDER.filter(s => counts[s] > 0)`.
- **Column header**: `BoardColumn` shows `<StatusIcon variant={status} color={STATUS_META[status].color}/>` + `STATUS_META[status].name` + the live count. No editable affordances.
- **Cards in a column**: `ColumnCards` uses `useCardsInStatus(status)` (a `boardCards`-scoped `useY` selector over `cardsInStatus(doc, status)`), wraps them in a vertical `SortableContext`, and renders `SortableCard`s + the `CardComposer` (which creates in `status`).
- **Drag → status**: `SortableCard` is a `useSortable` with `data: { type: "card", status }`. `StatusColumn` is a `useDroppable` with `data: { type: "column", status }`. On `onDragEnd`, the handler reads the active card's `status` (from) and the `over` target's `status` (to; from a column droppable or a sibling card), computes neighbors via `planMove(cardsInStatus(from).ids, cardsInStatus(to).ids, …)`, and calls `moveCard({ cardId, toStatus, afterId, beforeId })`.
- **Toggle**: the toolbar button flips `useSetShowEmptyColumns()(!showEmptyColumns)`, which executes the `setShowEmptyColumns` command; `useShowEmptyColumns()` re-derives from the synced meta and the column list responds.
- **Drawer status picker** (unchanged): the card drawer still calls `setCardStatus` (status-only, keeps `ord`), so changing status there moves the card to the matching column without reordering.

## How to test / verify

Run with the pinned Node 22 bin (`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`):

- `pnpm --filter @boardly/web run typecheck` → green.
- `pnpm --filter @boardly/web run lint` → green.
- `pnpm --filter @boardly/web run test` → **30 files, 158 tests pass**. Key specs:
  - `components/board/column.test.tsx` — eight columns in `STATUS_ORDER`; no add-column; headers not editable; hide-empty toggle hides zero-card columns and persists `showEmptyColumns=false` to board meta, then restores.
  - `components/card/card.test.tsx` — composer creates cards resolved via `cardsInStatus`.
  - `components/card/activity.test.tsx` — a `moveCard({toStatus})` logs a `status` timeline entry.
  - `components/card/status-select.test.tsx` — the drawer picker sets status via `setCardStatus` and logs activity.
  - `components/command-palette/palette.test.tsx` — "New card" creates a Todo card.
- `pnpm turbo run typecheck --continue` → every package green **except** the known pre-existing `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors (`getComputedStyle`/`document`), which are unrelated to this unit.
- e2e specs compile (`pnpm --filter @boardly/e2e run typecheck` fails only on that pre-existing `focus-mode.spec.ts` error). The live Playwright browser suite is **not** run here (needs a live server + is subject to the login rate limit) — the orchestrator does live verification.

Correct dark-mode look (per `DESIGN.md`): eight columns left→right Backlog…Duplicate, each with its status glyph + name + count; a card dragged from Todo into In Progress visibly re-statuses (drawer shows In Progress); the toolbar toggle collapses to only populated columns and back.

## Follow-ups / known gaps

- **Live dark-mode screenshot + drag verification is pending at the orchestrator level** (CLAUDE.md §2 requires a dark-mode screenshot for user-facing flows; not run here per the task).
- Swimlanes remain a read/triage view — cross-lane drag reordering is still a known follow-up (unchanged by this unit).
- The `showEmptyColumns` toggle applies to the standard board layout; swimlanes always show all eight status columns within each lane.
- The pre-existing `@boardly/e2e` `focus-mode.spec.ts` DOM-lib typecheck error is untouched (out of scope).
