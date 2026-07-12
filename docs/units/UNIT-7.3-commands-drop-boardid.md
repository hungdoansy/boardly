# UNIT-7.3 — Commands: drop `boardId`; context resolves the single per-user doc; prune board-entity commands

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 3). Satisfies R3, R4, R6.

## What changed

Every command now operates on the caller's **single per-user board doc**, resolved from the authenticated user by the command context — there is **no `boardId` argument anywhere** in the command surface. The board-*entity* commands are gone.

- **`packages/commands/src/context.ts`**
  - `CommandContext.getBoardDoc()` now takes **no argument** and returns the caller's single doc (resolved from `ctx.userId`).
  - Dropped `getWorkspaceDoc` from the interface.
  - `createMemoryContext` now returns a single in-memory board doc keyed by `board:{userId}` (distinct user ids still resolve distinct docs, so isolation is testable). The `docs` map is retained for test introspection.
- **`packages/commands/src/client-context.ts`** — `createClientContext` now wires `getBoardDoc: () => getBoardDoc(options.userId).doc` (no id arg) and no longer imports/wires `getWorkspaceDoc` from `@boardly/sync/client`.
- **`packages/commands/src/commands/board.ts`** — **deleted** `createBoard`, `archiveBoard`, `listBoards` (board-entity commands, which also imported the removed `addBoardRef`/`archiveBoardRef`/`renameBoardRef`/`listBoards` sync helpers). **Kept** `renameBoard`, `setBadgeConfig`, `setTicketPrefix` (space-settings commands), each with `boardId` dropped from its zod input. They read the board id (= user id) off the context via a small `boardId(ctx)` helper (`ctx.userId ?? ctx.clientId`) only to satisfy `getBoard(doc, userId)`'s `Board.id` argument.
- **`packages/commands/src/commands/io.ts`** — rewritten off the removed board-list helpers: `exportBoard` takes `{}` and snapshots the single doc; `importBoard` takes `{ snapshot, title? }` and populates the caller's single doc via `buildBoardFromSnapshot` (no `addBoardRef`, no client-chosen board id). Dropped the `newId` import.
- **Every other `packages/commands/src/commands/*.ts`** (`card`, `column`, `label`, `link`, `project`, `search`, `status`, `view`) — removed `boardId` from the zod input schema and replaced `ctx.getBoardDoc(input.boardId)` with `ctx.getBoardDoc()`. Purely mechanical; no behavior change. `moveCard` still takes `toColumnId`, and the column commands (`addColumn`/`renameColumn`/`moveColumn`/`archiveColumn`/`setColumnWipLimit`) are untouched apart from losing `boardId` — both are handled in Unit 8.
- **`packages/commands/src/catalog.ts`** — removed `createBoard`/`archiveBoard`/`listBoards` from the registry (imports and the `commands` array).
- **Tests** — `catalog.test.ts`, `commands/label.test.ts`, `commands/project.test.ts` drop `boardId` from every input/fixture, replace the removed `createBoard` setup with `initBoard(ctx.getBoardDoc(), …)` from `@boardly/sync`, and the export/import round-trip now imports into a *second user's* fresh doc (there is no longer a second board on one user).

## Why

- **Drop `boardId` (R4):** with one doc per user, the doc is identified by the authenticated caller, not by a client-supplied id. Threading `boardId` was redundant and was the vector for the `"main"`-id durability bug. The context resolves the doc; commands never name it.
- **Prune board-entity commands (R3):** create/archive/list only made sense with a board list + workspace index, both removed in Unit 1. `renameBoard`/`setBadgeConfig`/`setTicketPrefix` remain because they are *space settings* (they mutate the one doc's meta), not board-entity operations.
- **Keep it mechanical (R6):** per the plan, Unit 3 must not redesign the column commands or `moveCard` — it only strips `boardId`. Unit 8 removes the column commands and repurposes `moveCard` to a status move. Stripping `boardId` from code Unit 8 will delete is accepted trivial rework (Risks table).
- **Command names stay stable** (except the removed board-entity ones) for agent-native parity.

## How it works

`CommandContext` exposes `getBoardDoc(): Y.Doc` and `userId?`. On the client, `createClientContext({ userId })` binds `getBoardDoc` to the sync provider's per-user handle (`getBoardDoc(userId).doc`, room `board:{userId}`). In memory (tests/headless), `createMemoryContext({ userId })` lazily creates one `Y.Doc` per `board:{userId}` room. A command body calls `ctx.getBoardDoc()` and runs the same `@boardly/sync` content ops as before. Commands that must echo a `Board` shape (`renameBoard`, `setBadgeConfig`, `setTicketPrefix`, `importBoard`) pass `ctx.userId ?? ctx.clientId` as the board id (`Board.id` = the user id, per Unit 1).

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/commands run typecheck` → **green**.
- `pnpm --filter @boardly/commands run test` → **3 files, 14 tests, all passing**.
- `pnpm --filter @boardly/commands run lint` → clean.

Scenarios covered:
- **Happy (single doc):** `createCard`/`moveCard`/`setCardStatus`/`addLink`/`createProject`/`setCardProject`/`renameColumn` run against the context's one doc and return JSON-serializable results (`catalog.test.ts`, `label.test.ts`, `project.test.ts`).
- **Edge:** an empty card title is rejected by zod before mutating — the column card count is unchanged (`catalog.test.ts`).
- **Integration (parity):** a client-style and a server-style memory context, same inputs + injected `clientId`/`now`, produce identical state on their single docs.
- **Round-trip:** `exportBoard` (input `{}`) → `importBoard` into a *different user's* fresh doc reproduces the column + card.
- **Removed:** `getCommand("createBoard" | "listBoards" | "archiveBoard")` are all `undefined`.

## Follow-ups / known gaps

- **`@boardly/server` `tsc --noEmit` is still red — now solely in the server's own `routes/commands.ts` (Unit 4 territory).** The transitive `packages/commands` import errors that made the server red after Unit 2 are **resolved**. The two remaining errors are because `routes/commands.ts` still builds a `CommandContext` with the old shape (`getWorkspaceDoc: …` and `getBoardDoc: (id) => …`), which no longer matches the boardId-less interface. Per this unit's scope, server code was **not** modified; Unit 4 aligns the REST/MCP surface (drop `boardId` handling, resolve the authenticated user's doc, remove the `getWorkspaceDoc` wiring). `apps/mcp` command tooling derives its schemas from the catalog, so it will pick up the boardId-less inputs automatically in Unit 4.
- **Column commands still exist and `moveCard` is still column-based** — they only lost `boardId` here. Unit 8 deletes the column commands, repurposes `moveCard` to `{ cardId, toStatus, … }`, and adds `setShowEmptyColumns`.
- **`searchCards` still reports `columnId`** on results (unchanged); it moves to status-based grouping alongside the Unit 7/8 column→status collapse.
