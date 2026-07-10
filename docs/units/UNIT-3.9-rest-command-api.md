# UNIT 3.9: REST command API (agent write path)

- **Plan unit:** 3.9 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R13
- **Dependencies:** 1.7 (command layer), 3.3 (auth), 3.5 (sync), 3.8 (ownership) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

The command catalog is now exposed over authenticated HTTP and executed **server-side against the
live board doc**, so agent/script edits persist and broadcast exactly like UI edits (agent-native
parity, R13).

- `apps/server/src/routes/commands.ts`:
  - `GET /api/commands` — the self-documenting catalog: `{name, description, inputSchema}` where
    `inputSchema` is JSON Schema derived from each command's zod `input` via `z.toJSONSchema`.
  - `POST /api/commands/:name` — Bearer-auth → look up command (`404` unknown) → validate body
    against the zod schema (`400` with issues) → resolve the target doc (board-scoped by `boardId`,
    else the user's workspace) → **ownership check** (`403`) → open Hocuspocus **direct
    connection(s)**, run the command via `packages/commands` with a server `CommandContext`, then
    disconnect (persists to Postgres + broadcasts). Returns the command's JSON result.
- `apps/server/src/sync/naming.ts` — server-side `boardDocName`/`workspaceDocName` (match the client
  - authz parser).
- `apps/server/src/{app,index}.ts` — mount `/api/commands` when `database` + `keys` + `hocuspocus`
  are present; `index.ts` passes `syncServer.hocuspocus`.
- `apps/server` now depends on `@boardly/commands` (workspace) so the server runs the identical
  catalog the UI uses.
- Tests: `apps/server/src/routes/commands.test.ts`.

## Why (decisions)

- **One catalog, executed via a direct connection.** Running the _same_ `packages/commands` on the
  server (against a Hocuspocus direct connection to the board doc) guarantees REST and UI produce
  identical doc state, and the mutation flows through the normal persist+broadcast path — no separate
  server-side write logic to drift.
- **Server `CommandContext` from direct connections.** `getBoardDoc(boardId)` / `getWorkspaceDoc()`
  return the direct-connection documents; the command's own `doc.transact` mutations are captured by
  Hocuspocus. `now`/`clientId` are injected (server clock, doc clientID) to keep commands
  deterministic.
- **Target resolved from input, ownership enforced.** A `boardId` in the input means a board-scoped
  command → the board-owner check from 3.5/3.8 gates it (`403`); otherwise the user's own workspace.
  A board doc the request didn't open is refused (guards multi-doc commands like `searchCards`).
- **`disconnect()` before responding.** Disconnecting the direct connection flushes the store, so the
  write is durably in Postgres by the time the caller gets `200` — no read-after-write race.
- **JSON Schema from zod (`z.toJSONSchema`).** The catalog is generated, so the MCP server (3.10) maps
  each command's schema to a tool with zero hand-maintenance and no drift from REST.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Integration (Docker, real db + sync):** `commands.test.ts` — `GET /api/commands` lists **all**
  commands with a valid `object` input schema; `POST addColumn`→`createCard` on an owned board
  creates the card and **persists it to Postgres** (raw doc reload finds it); REST vs in-process
  execution yield the same shape (parity: default status, linked column); a command on a **non-owned
  board → 403**; unknown → `404`; invalid input → `400`; no auth → `401`. Run:
  ```sh
  docker compose up -d db
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test
  ```
  70 server tests pass.
- **Live broadcast (server + a real client):** a `HocuspocusProvider` connected to a board received a
  card created via `POST /api/commands/createCard` — the REST edit broadcast to the connected client
  (the plan's "REST-created card appears in a second connected client").
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`, `pnpm --filter
@boardly/server build`, `pnpm format:check` — all green. Backend API (no UI) → no Playwright
  screenshot applies.

## Follow-ups / known gaps

- **MCP server (3.10)** consumes `GET /api/commands` and forwards tool calls to `POST
/api/commands/:name`.
- **Service token** (for the MCP server to act on behalf of a user without a user login) is not yet
  implemented — only user Bearer tokens are accepted. Adding a scoped service token is a 3.10 concern.
- **Multi-doc commands** (`searchCards` spans board docs) aren't executable via this single-doc
  direct-connection path; they return `422`. A read-oriented path can be added if agents need search.
- **Idempotency keys** aren't implemented; commands that dedup (e.g. `addLink`) are naturally
  idempotent, but a general idempotency-key header is a later addition.
