# UNIT 4.2: Grouping / swimlanes + WIP limits

- **Plan unit:** 4.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 4)
- **Status:** done
- **Requirements:** R5, R8
- **Dependencies:** 4.1 (saved views / filters) — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshots:** `docs/units/screenshots/UNIT-4.2-swimlanes-dark.png` (group-by-priority lanes),
  `docs/units/screenshots/UNIT-4.2-wip-dark.png` (over-limit WIP badge)

## What changed

Two board affordances: **grouping into swimlanes** by a card field, and a **soft per-column WIP
limit** shown on the column header.

- `packages/domain/src/filters.ts` — the pure grouping model (added alongside the 4.1 filter model):
  - `GroupByField = "status" | "priority" | "severity" | "label" | "assignee"`.
  - `CardGroup {key, cards}` — `key === ""` is the trailing ungrouped/missing lane.
  - `groupCards(cards, groupBy): CardGroup[]` — partitions cards into ordered lanes. Enum fields
    order naturally (priority Urgent→Low, status by `STATUS_ORDER`, severity S1→S4); label/assignee
    order by first appearance; the `""` lane always sorts last. **Label grouping is multi-valued** —
    a card with N labels appears in N lanes. Card order within a lane preserves input order.
  - `groupLabel(groupBy, key, {labelName?})` — pure lane-title resolver: enum keys → display names,
    `""` → "No priority" / "No severity" / "No label" / "Unassigned", label key → provided name
    (falls back to the raw id), assignee key → the raw id (no user directory yet).
  - `SavedView.groupBy?: GroupByField | null` — group choice persists with a saved view (4.1).
- `packages/sync/src/board-doc.ts` — `setColumnWipLimit(doc, columnId, wipLimit|null, now)` sets/
  clears `wipLimit` on the column `Y.Map` and bumps `meta.updatedAt`. (`allLiveCards(doc)` already
  existed from 3.6 and backs the whole-board swimlane read.)
- `packages/commands` — `setColumnWipLimit` command (`{boardId, columnId, wipLimit: number.int
.positive().nullable()}`), registered in the catalog so it is reachable from REST/MCP too
  (agent-native parity). `view.saveView` groupBy enum tightened to the `GroupByField` union.
- `apps/web`:
  - `components/board/swimlanes.tsx` (new) — the grouped view: rows are lanes, columns match the
    board's columns; each cell holds the lane's cards for that column. A dashed **Unsorted** cell
    per lane surfaces cards whose column was archived. Empty-state when no cards match.
  - `components/board/column.tsx` — the count span became a **`WipBadge`**: a Popover whose trigger
    shows `count` (or `count/limit` when set, in the danger color once `count >= limit`) and whose
    content is a number input to set/clear the limit.
  - `components/board/board-view.tsx` — accepts `groupBy?: GroupByField | null`; renders
    `<Swimlanes>` when set, otherwise the normal DnD column board; threads `onSetWipLimit` to each
    column.
  - `components/board/views.tsx` — the Filter menu gained a **Group by** segmented selector
    (None/Status/Priority/Severity/Label/Assignee); `ActiveView` gained `groupBy`; saving a view
    stores the current groupBy.
  - `components/app/workspace-app.tsx` — holds `groupBy` in `activeView`, resets on board switch,
    passes it to `BoardView`.
  - `lib/use-board.ts` — `useColumnActions().setWipLimit`; `useAllCards(boardId)` (whole-board,
    non-archived, for swimlane grouping).

## Why

- **Grouping lives in the pure domain, rendering in the component.** `groupCards`/`groupLabel` are
  side-effect-free and fully unit-tested; the React layer only maps lanes×columns to cells. Keeps
  the ordering rules (ungrouped-last, priority order, multi-valued labels) testable in isolation and
  identical on any client/agent.
- **Swimlanes are a read/triage view, not a second DnD surface.** Cross-lane drag reordering would
  need per-field mutation semantics (drop into "High" lane ⇒ set priority=High) and multi-axis DnD;
  that is deliberately deferred (see gaps). Cards remain openable and archivable in lanes, so the
  view is useful without it.
- **WIP limits are soft by design (R5/plan).** The badge warns at/over the limit but never blocks
  adding — matching Linear/kanban norms where limits are a signal, not a gate. Stored per column so
  it syncs like any other column property and is settable by agents via the command.
- **`count/limit` uses `count >= limit`** (not `>`) for the warning: a column exactly at its limit is
  already "full", which is the moment the signal is useful.

## How it works

- **Lanes:** `Swimlanes` reads `useAllCards` (+ the active filter), calls `groupCards`, and renders
  one `<Lane>` per group. Each lane iterates the board's `useColumns` and filters the lane's cards by
  `columnId` into a `<LaneColumn>` cell (with its own count). Lane title comes from `groupLabel`,
  resolving label ids through the board's label palette. The ungrouped lane renders muted.
- **WIP badge:** `WipBadge` derives `over = wipLimit !== undefined && count >= wipLimit` during
  render (no mirrored state). The popover's number input commits on Enter/Set (empty/invalid ⇒
  clear) via `onSetWipLimit → setColumnWipLimit` command. `count` is the live filtered column count
  from `useCardCounts`.
- **Persistence & parity:** WIP writes go through the command layer, so REST/MCP agents can set
  limits identically. Group-by is view state (persisted when saved as a view); it does not mutate the
  board.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (domain):** `pnpm --filter @boardly/domain test` — `filters.test.ts` `groupCards`
  (priority natural order + None lane last; label multi-valued; assignee Unassigned last) and
  `groupLabel` (enum names; per-field ungrouped names; label-name vs raw id). **48 domain tests
  pass.**
- **Unit (web):** `pnpm --filter @boardly/web test` — `swimlanes.test.tsx`: group-by-priority
  produces lanes `Urgent / High / No priority` in order with cards under each; empty-state when no
  cards; no lanes when `groupBy` is null; WIP badge shows `2/2` with the danger class at limit;
  setting a limit through the popover writes `wipLimit` to the column. **97 web tests pass.**
- **Commands:** `pnpm --filter @boardly/commands test` — 7 pass (catalog includes
  `setColumnWipLimit`).
- **e2e (Playwright, dark, server + build):** signed-in board with 5 cards across To Do/Doing;
  set priorities Urgent/High/Medium (two left as None); set To Do WIP=2 → header shows **`3/2` in
  red** (`UNIT-4.2-wip-dark.png`); **Group by → Priority** → four lanes Urgent(1)/High(1)/Medium(1)/
  No priority(2), each spanning the columns with per-cell counts (`UNIT-4.2-swimlanes-dark.png`).
  Checked against `DESIGN.md` (dense, calm, Linear-style; tokens only).
- **Gates:** `pnpm -r typecheck`, `pnpm --filter @boardly/web lint`,
  `pnpm --filter @boardly/web build`, `pnpm format:check` — all green. Docker `boardly-db` up;
  migrations applied.

## Follow-ups / known gaps

- **Cross-lane / cross-column drag in swimlane view** is not wired — dropping a card into a lane does
  not yet set the grouped field, and within-cell reordering is disabled in grouped mode. The
  ungrouped board keeps full DnD. This is the main deferred piece.
- **Assignee lanes show the raw user id** (there is no user directory yet); `groupLabel` already
  accepts a resolver hook for when one lands.
- **Applying a view's `sort`** in the board (the field exists and is tested in the model) still isn't
  wired — can land alongside a future lane-sort control.
- **Keyboard nav** (arrow/`p`/`e` shortcuts) targets the ungrouped column board; the swimlane view is
  pointer-first for now.
