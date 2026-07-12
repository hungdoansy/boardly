# UNIT-7.4 — Server REST + MCP: align the agent surface to boardId-less commands

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 4). Satisfies R4, R6.

## What changed

The REST command endpoint and the MCP tool surface now execute the boardId-less commands (Unit 3) against the **authenticated user's single content doc** — no `boardId` in requests, tool schemas, or context wiring.

- **`apps/server/src/routes/commands.ts`**
  - The `CommandContext` is built for the new shape: `getBoardDoc()` takes **no argument** and returns the caller's doc; `getWorkspaceDoc` is gone.
  - The request handler no longer reads a `boardId` from the body, no longer does the `boardId === userId` ownership check, and no longer returns `403` (a user can only ever reach the doc keyed by their own identity).
  - Only **one** doc connection is opened per request — `board:<userId>` — instead of a workspace connection plus an optional board connection. `clientId` is derived from that doc.
- **`apps/server/src/sync/naming.ts`** — dropped the now-unused `workspaceDocName` export (it was only wired into the old command route); `boardDocName` is retyped/re-commented to take a `userId`.
- **`apps/server/src/routes/commands.test.ts`** — rewritten for the boardId-less path: happy `createCard` (no `boardId`) persists to `board:<userId>` and reads back; a two-user test proves the doc is resolved from the authenticated id (distinct docs); parity test keeps the result-shape assertion; the old `403` ownership test is removed and the error test now covers `404`/`400`/`401`.
- **`apps/mcp/src/tools.test.ts`** — fixtures updated to a boardId-less catalog (`createCard` with `columnId`/`title`; `setTicketPrefix` replacing the removed `listBoards`), the forwarding test drops the stale `boardId` arg, and a new test asserts **no tool carries a `boardId` property** and **no board-registration/list tool** (`createBoard`/`listBoards`/`archiveBoard`/`registerBoard`) exists.

**No changes were needed to `apps/mcp/src/tools.ts` or `index.ts`.** The MCP tool surface is *generated* from the live `GET /api/commands` catalog (`fetchCatalog` → `buildTools`), so removing `boardId` and the board-entity commands in Unit 3 flows through automatically — a design the new test now locks in.

## Why

- **Resolve the doc from identity, not a request field (R4):** with one doc per user, the caller *is* the address. Reading a `boardId` from the body was redundant and was the vector for the old `"main"`-id bug; dropping it removes an entire failure mode and the `403` branch.
- **Keep the agent surface in lockstep (R6, agent-native):** because MCP derives its tools from the REST catalog, the REST/MCP contracts change together and cannot drift. No board-registration or board-list tool/route remains.
- **Remove dead workspace wiring:** the route was the last server consumer of `workspaceDocName`; with the workspace index doc gone (Unit 1) and the command context no longer exposing `getWorkspaceDoc` (Unit 3), the workspace connection served no purpose.

## How it works — resolving "this user's doc" (the deferred question)

The plan deferred *how* the server resolves the authenticated user's doc for REST/MCP: an in-process Y.Doc from a provider registry, or a short-lived Hocuspocus direct connection.

**Decision: keep the existing mechanism — a short-lived Hocuspocus `openDirectConnection` — keyed by the authenticated `userId` instead of a request `boardId`.** The pre-Unit-4 route already used `hocuspocus.openDirectConnection(...)` for both the workspace and board docs; this unit collapses that to a single call:

```ts
const boardConn = await hocuspocus.openDirectConnection(boardDocName(userId), { userId });
// ... build ctx with getBoardDoc: () => boardConn.document! ...
await boardConn.disconnect(); // flushes to Postgres + broadcasts to connected clients
```

Rationale (simplest approach consistent with existing code):
- **Server/UI parity is preserved.** A direct connection goes through the same Hocuspocus document lifecycle (`onLoadDocument` from Postgres, `onStoreDocument` on disconnect) as a browser client, so a REST/agent edit persists to Postgres **and** broadcasts to any connected UI exactly like a UI edit. An out-of-band in-process Y.Doc would have to re-implement load/store/broadcast.
- **No new provider/registry on the server.** The server has no `@boardly/sync/client` provider (that entry pulls in IndexedDB/React); a direct connection is the established server-side path.
- **Direct connections are server-internal** and do not pass through the socket `onAuthenticate` ticket check, so no ticket is minted for REST calls — authorization is the Bearer token (`authenticateBearer`), and the doc name is derived from that token's `userId`, so a caller structurally cannot address another user's doc.
- **`disconnect()` guarantees durability before responding**, matching the prior contract.

Trade-off: opening/closing a direct connection per request is marginally heavier than mutating a cached in-process doc, but it is correct-by-construction for persistence/broadcast and matches the code already in the repo. If REST throughput ever matters, a pooled/long-lived connection is a later optimization, not a correctness change.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/server run typecheck` → **green** (this unit closes the only red left by Units 1–3, which was `commands.ts` building the old context shape).
- `pnpm --filter @boardly/mcp run typecheck` → **green**.
- `pnpm --filter @boardly/mcp run test` → **1 file, 7 tests, all passing**.
- `pnpm --filter @boardly/server run test` → without a DB, the REST integration suite is skipped (`5 files passed | 6 skipped`, `26 passed | 39 skipped`). Against the repo's dev Postgres it runs fully:
  - `DATABASE_URL="postgres://boardly:boardly@localhost:5433/boardly" pnpm --filter @boardly/server run test` → **11 files, 65 tests, all passing**.

Scenarios covered (REST integration, `commands.test.ts`):
- **Happy:** `POST /api/commands/createCard` with **no `boardId`** mutates `board:<userId>` and the content is read back from Postgres after the request's flush.
- **Doc resolution:** two different bearer tokens write two distinct docs (`board:<alice>` vs `board:<bob>`) — proof the doc is resolved from the authenticated id.
- **Parity:** the REST result shape matches an in-process execution (default `status: "todo"`, linked `columnId`).
- **Errors:** unknown command → `404`; invalid args (missing `title`) → `400` with zod issues; no auth → `401`.

Scenarios covered (MCP, `tools.test.ts`):
- Catalog → tools 1:1 mapping preserves name/description/schema; `$schema` stripped; `type: "object"` guaranteed.
- **No `boardId` on any tool** and **no `createBoard`/`listBoards`/`archiveBoard`/`registerBoard` tool** (the boardId-less, board-registration-free surface).
- `callCommand` forwards with the Bearer token and surfaces `400/401/403` as `McpToolError`.

## Follow-ups / known gaps

- **Web still won't compile** — `@boardly/web` continues to reference `boardId`/board-entity hooks and is fixed in Units 5–6; do **not** run the full monorepo build until then. This unit deliberately touched only `@boardly/server` and `@boardly/mcp`.
- **`authz.ts` still parses `workspace:` doc names** (a `DocRef` branch retained by Unit 2). It is now unreachable from the command route but was left intact as it is Unit 2's committed surface; a later cleanup could drop the workspace branch entirely once nothing constructs or authorizes a workspace room.
- **No pooled direct connection** — per-request open/disconnect is used for simplicity/correctness; pool later only if REST throughput becomes a concern.
