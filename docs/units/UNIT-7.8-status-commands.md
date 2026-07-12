# UNIT-7.8 — Commands: remove column commands, `moveCard` sets status, add `setShowEmptyColumns`

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 8). Realizes the command-layer side of R9/R10/R11 on top of Unit 7's domain+sync change.

This restores `@boardly/commands` to green after Unit 7 made `status` the single placement axis (deleting the `Column` type, `Card.columnId`, and every sync column op). Command **names** stay stable except for the deletions and the one addition, preserving agent-native parity (REST/MCP enumerate the catalog).

## What changed

- **Deleted `packages/commands/src/commands/column.ts`** — `addColumn`, `renameColumn`, `moveColumn`, `archiveColumn`, `setColumnWipLimit` (they called sync ops that no longer exist). There was no `column.test.ts` to remove.
- **`packages/commands/src/commands/card.ts`**:
  - `moveCard` input is now `{ cardId, toStatus, afterId?, beforeId? }`. `toStatus` is `z.enum(STATUS_VALUES)` (built from the domain values so the agent surface can't drift). It delegates to sync `moveCard(doc, cardId, toStatus, neighbors, clientId, now, actor)` — a single status + between-neighbors `ord` write. This is the command realization of "drag applies status immediately" (R10). `toColumnId` is gone.
  - `createCard` input's `columnId` (removed from `AddCardParams` in Unit 7) is replaced with an optional `status: STATUS_VALUES` (defaults to Todo in sync). Placement at creation is now by status.
- **`packages/commands/src/commands/status.ts`** — `setCardStatus` **unchanged** (drawer picker: status-only, no reorder). `moveCard` and `setCardStatus` intentionally overlap; see below.
- **`packages/commands/src/commands/board.ts`** — added `setShowEmptyColumns` (`{ show: boolean }`) calling sync `setShowEmptyColumns`. It follows the sibling board-meta commands (`setBadgeConfig`/`setTicketPrefix`): mutate meta, return `getBoard(doc, boardId)`.
- **`packages/commands/src/commands/search.ts`** — `searchCards` previously walked `liveColumns` + `cardsInColumn` + `reclaimCards` (all removed). It now searches `allLiveCards(doc)` and its result projection drops `columnId`, keeping `status` as the grouping field.
- **`packages/commands/src/catalog.ts`** — removed the five column commands from the registry; added `setShowEmptyColumns`. All other command names are unchanged.
- **`packages/commands/src/index.ts`** — dropped the `export * from "./commands/column"` re-export.
- **Tests** — rewrote `catalog.test.ts` (no column ops; status-based core/parity/export-import flows; asserts the five column commands are absent and `setShowEmptyColumns` is present). Updated `commands/project.test.ts` and `commands/label.test.ts` seeds (they used `addColumn` + `createCard({columnId})`). Added `commands/card.test.ts`, `commands/status.test.ts`, `commands/board.test.ts` for the new scenarios.

## Why

- **`moveCard` vs `setCardStatus` overlap is deliberate.** Because a card's column *is* its status (Unit 7), both commands can change status — but they serve different UI gestures and keep parity with them:
  - `moveCard(toStatus, afterId?, beforeId?)` is the **drag** path: it sets the status **and** positions the card between two neighbors (writes `status` + `ord`). Used when a card is dragged onto a column at a specific slot.
  - `setCardStatus(status)` is the **drawer status picker**: it sets status only and leaves `ord` untouched, so the card keeps its relative position when it lands in the new column.
  Keeping both means every user gesture has a matching command (agent-native parity) without one gesture's semantics being forced onto the other.
- **Enum from `STATUS_VALUES`.** Both `moveCard` and `createCard` (and `setCardStatus`) derive their zod enum from the domain `STATUS_VALUES`, so an invalid status is rejected by zod at the boundary before any Yjs mutation, and the agent surface can never drift from the domain's eight statuses.
- **`setShowEmptyColumns` as a first-class command.** The show/hide-empty-columns toolbar preference is a synced board-meta write (Unit 7 added the setter + meta field); exposing it as a command keeps it available to REST/MCP/agents, not just the web toolbar.
- **`searchCards` uses `allLiveCards`.** The old union of per-column cards plus reclaimed (archived-column) cards collapses to "every non-archived card," which `allLiveCards` returns directly. `columnId` no longer exists, so `status` is the projected grouping field.

## How it works

Commands are still context-injected (`getBoardDoc`, `clientId`, `now`, `userId`) and validated by zod before running. `moveCard` computes neighbors from `afterId`/`beforeId` and calls sync `moveCard`, which writes `status` + a fractional `ord` in one transaction and logs a `status` activity entry only when the status actually changes. `createCard` calls sync `addCard({ status })`, which defaults to Todo and orders the new card at the end of the target status group. `setShowEmptyColumns` writes the `showEmptyColumns` meta key (reads back `true` when never set) and returns the plain board. The catalog is the single registry REST (U3.9) and MCP (U3.10) enumerate, so removing/adding a command there is the only place the agent surface changes.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

```
pnpm --filter @boardly/commands run typecheck   # green
pnpm --filter @boardly/commands run test         # 6 files, 25 tests pass
pnpm --filter @boardly/commands run lint         # clean
pnpm --filter @boardly/server run typecheck      # still green (uses the catalog)
```

Key scenarios asserted by the tests:

- `commands/card.test.ts` — `moveCard({ cardId, toStatus: "in_review", afterId, beforeId })` sets status to `in_review` and slots the card between neighbors (asserted via `cardsInStatus` order `[a, c, b]`), and clears the old status column; a same-status move only reorders; `createCard` defaults to Todo and honors an explicit status; a status outside the eight is rejected by zod (nothing mutates).
- `commands/status.test.ts` — `setCardStatus({ status: "done" })` changes status without reordering (the card keeps its `ord`; the sibling keeps its slot); an out-of-set status is rejected by zod before mutating.
- `commands/board.test.ts` — `setShowEmptyColumns({ show: false })` flips the board-meta flag (asserted via `getBoard(...).showEmptyColumns`); defaults to `true`; a non-boolean is rejected by zod.
- `catalog.test.ts` — the five column commands (`addColumn`/`renameColumn`/`moveColumn`/`archiveColumn`/`setColumnWipLimit`) are absent; `setShowEmptyColumns` is present; core mutations run and return JSON-serializable results; export/import round-trips cards by status; the client/server parity script (now using status-based `moveCard`/`setCardStatus`) produces identical state on both contexts.

## Follow-ups / known gaps

- **`@boardly/web` still does not compile** — by design. **Unit 9** aligns the board UI: render the eight fixed status columns, make drag call `moveCard({ toStatus })`, wire the empty-columns toolbar toggle to `setShowEmptyColumns`, and drop the interim default-column seed and any `columnId`/column-command references.
- `searchCards` result order is now `allLiveCards` order (insertion-ish, not per-column ord); the ranked fuzzy search (U2.11) will define ordering when it lands.
