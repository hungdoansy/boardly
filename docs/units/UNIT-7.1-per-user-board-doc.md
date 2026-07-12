# UNIT-7.1 — One per-user board doc; delete the workspace index

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 1). Satisfies R1, R3, R6.

## What changed

The single content doc is now addressed by the **user's id** (`board:{userId}`), and the board-list / workspace-index machinery is gone. This is a behavior-preserving refactor except that the doc is keyed by user id instead of a client-chosen board id, and the workspace-index doc no longer exists. The column/card/status shape is untouched (the column→status collapse is a later unit).

- **`packages/sync/src/provider.ts`**
  - Dropped `workspaceRoom`, `workspaceDocName`, and `getWorkspaceDoc`.
  - `boardRoom(userId)` / `boardDocName(userId)` / `getBoardDoc(userId)` now take the user's id; the room is `boardly:board:{userId}` and the server document name is `board:{userId}`. The doc registry, `getDoc`, and `attachNetwork` are unchanged.
- **`packages/sync/src/schema.ts`**
  - Removed the `workspaceBoards` accessor and the `boardRefToPlain` converter (and the `WorkspaceBoardRef` import).
  - `boardToPlain(doc, userId)` now documents that `userId` becomes `Board.id`.
- **`packages/sync/src/board-doc.ts`** — `getBoard(doc, userId)` and `boardToSnapshot(doc, userId)` params renamed for clarity; `initBoard` already took no board id. All content ops (columns/cards/labels/projects/meta/activity/views/checklist/links) are unchanged.
- **`packages/sync/src/index.ts`** — dropped `export * from "./workspace-doc"`. (`client.ts` re-exports `./provider`, so removing the workspace helpers there is sufficient — no direct edit needed.)
- **Deleted** `packages/sync/src/workspace-doc.ts` and `packages/sync/src/workspace-doc.test.ts`.
- **`packages/domain/src/types.ts`** — deleted `WorkspaceBoardRef`; documented `Board.id` as the owning user's id (field kept, value = userId). `Column`/`Card` types untouched.

## Why

- **One doc per user (R1):** with a single-board product, the client-chosen board id (`"main"`) was vestigial and actively broke server registration/authz. Keying the doc by the authenticated user's id removes the whole id-scheme bug class; the doc is authorized purely by identity (server change lands in Unit 2).
- **Remove the workspace index (R3):** an index doc that lists exactly one board is pure dead complexity. `WorkspaceBoardRef` and the `addBoardRef`/`listBoards`/`archiveBoardRef` surface are deleted.
- **Keep internal `board` naming:** only the board *entity* (client id / registry / index) is removed; the code keeps `board-doc`, `getBoardDoc`, `boardMeta`, etc. `Board.id` is now the user id (the "resolve when touching `boardToPlain`/`getBoard`; default is `id = userId`" open question — resolved to keep the field).

## How it works

`getBoardDoc(userId)` resolves (or lazily creates) the shared `DocHandle` for room `boardly:board:{userId}` from the registry, so every caller for a given user shares one in-memory `Y.Doc`. Two different user ids resolve to two different rooms and therefore two independent docs — content written under one is absent from the other. `boardToPlain`/`getBoard` stamp the passed `userId` as `Board.id`; nothing else in the content schema changed.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/sync run typecheck` → green.
- `pnpm --filter @boardly/domain run typecheck` → green.
- `pnpm --filter @boardly/sync run test` → **44 passed (7 files)**.
- `pnpm --filter @boardly/domain run test` → **86 passed (7 files)**.

Scenarios covered:
- `provider.test.ts` — `getBoardDoc("u1")` and `getBoardDoc("u2")` are distinct docs; a card set on u1 is absent on u2; repeated calls for the same id return the same shared handle; `boardDocName("u1") === "board:u1"`.
- `board-doc.test.ts` — `getBoard(doc, "u1").id === "u1"`; a brand-new uninitialized doc reports no columns and no cards; existing column/card/project/move/status/link tests pass unchanged with the id param now meaning userId.
- `io.test.ts` — JSON snapshot export→import round-trips on the per-user doc (`USER_ID`).

## Follow-ups / known gaps

- **Downstream packages will not compile yet — expected, by design.** `@boardly/server`, `@boardly/commands`, and `@boardly/web` still reference the removed workspace helpers / a `boardId`; those are fixed in Units 2–6. This unit only requires `@boardly/sync` and `@boardly/domain` to build and pass their own tests.
- **Sync scripts** (`packages/sync/scripts/seed-demo-board.ts`, `add-brand-showcase-card.ts`) still import `./workspace-doc` and will fail to run until the seed is rewritten to the per-user doc in Unit 11. They are outside the package's `tsc`/test include, so they do not affect this unit's green build.
