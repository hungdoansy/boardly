# UNIT 3.5: Hocuspocus sync server (auth + Postgres persistence)

- **Plan unit:** 3.5 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R3, R9
- **Dependencies:** 3.2 (schema), 3.3 (auth) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

An authorized, Postgres-persistent Yjs sync server (Hocuspocus) co-hosted on the Fastify HTTP server
at `/sync`.

- `apps/server/src/sync/ticket-store.ts` — `createTicketStore()`: one-time, short-lived (30 s) WS
  tickets (`issue(userId)` / `consume(token)`). Single-use (deleted on consume) and TTL-checked.
- `apps/server/src/sync/authz.ts` — `parseDocumentName` (`board:<id>` / `workspace:<id>`) and
  `authenticateConnection(deps, {token, documentName, origin})`: origin allow-list → consume ticket →
  ownership check (`board.ownerId === userId`, or `workspace:` must be the user's own). Throws
  `SyncUnauthorizedError` on any failure.
- `apps/server/src/sync/persistence.ts` — `loadDocState`/`storeDocState` over `yjs_documents`
  (`bytea` snapshot, upsert) + `createDatabaseExtension(db)` wrapping them as a Hocuspocus
  `@hocuspocus/extension-database`.
- `apps/server/src/sync/hocuspocus.ts` — `createSyncServer({db, ticketStore, config})` (Hocuspocus
  with the DB extension + `onAuthenticate` calling `authenticateConnection`) and
  `attachSyncServer(httpServer, hocuspocus)` (routes `/sync` WS upgrades via `ws`, rejects other
  paths, returns a disposer that flushes pending stores + closes connections).
- `apps/server/src/index.ts` — builds a ticket store + sync server and attaches it to `app.server`
  after listen; the disposer runs on shutdown.
- Deps pinned: `@hocuspocus/server 4.3.0`, `@hocuspocus/extension-database 4.3.0`, `ws 8.21.0`,
  `yjs 13.6.31`; dev `@types/ws 8.18.1`.
- Tests: `apps/server/src/sync/hocuspocus.test.ts`.

## Why (decisions)

- **One-time WS tickets, not the access token.** Browsers can't set an `Authorization` header on a WS
  upgrade, and putting a long-lived token in the URL leaks it into logs/history. A single-use,
  30-second ticket (exchanged over HTTP in Unit 3.6) is presented instead — a leaked ticket is
  near-useless. The store is shared with the (3.6) ticket endpoint.
- **Authorize before sync, and throw.** `onAuthenticate` runs before any document data flows; throwing
  makes Hocuspocus close with `4403` (Forbidden), which `HocuspocusProvider` treats as terminal — no
  reconnect storm. Order matters: **origin is checked before the ticket is consumed**, so a
  bad-origin probe can't burn a legitimate ticket (tested).
- **Ownership from the `boards` table.** `board:<id>` requires `board.ownerId === userId`;
  `workspace:<userId>` must match the ticket's user. (Board rows are seeded here in tests; the API to
  create them lands with 3.6/3.9 — noted below.)
- **Snapshot persistence over `bytea`.** Hocuspocus debounces `store` and hands the full encoded
  state; we upsert it. Simpler and correct at this scale — append+compact would complicate the read
  path for no benefit against the live API.
- **Co-hosted, not a second port.** `attachSyncServer` hooks the Fastify server's `upgrade` event
  with a `noServer` `ws` server and gates on the `/sync` path, so auth and sync share one origin
  (one CORS/cookie domain) and one process.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (always):** ticket store (consume-once, expired/unknown → null) and `parseDocumentName`.
- **Integration (Docker exercised), gated on `DATABASE_URL`:** `hocuspocus.test.ts` seeds
  users/boards and asserts — owner accepted; **non-owner rejected**; **expired/invalid ticket
  rejected**; **disallowed origin rejected without consuming the ticket**; workspace room authorized
  for its owner only; and **persistence round-trip + two-client convergence** (merge two docs, store
  the snapshot, reload into a fresh doc → both edits present; upsert overwrites). Run:
  ```sh
  docker compose up -d db
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test
  ```
  40 server tests pass against the container db.
- **Live wiring smoke:** started the server (`sync on /sync`) and connected a raw `ws` client — a WS
  to `/sync` upgrades (Hocuspocus attached, then `onAuthenticate` governs sync), while `/nope` is
  rejected (socket destroyed, no upgrade).
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test` (server 18 pass + 22
  db-gated skips by default), `pnpm --filter @boardly/server build`, `pnpm format:check` — all green.
  No user-facing UI, so no Playwright screenshot applies.

## Follow-ups / known gaps

- **WS-ticket endpoint + client provider wiring (3.6)** issues tickets from the shared store and
  connects the web client (`HocuspocusProvider`) to `/sync`.
- **Board rows in Postgres.** Sync of a `board:<id>` doc requires a matching `boards` row; the create
  path (REST/API) arrives with 3.6/3.9. Until then only seeded boards authorize.
- **Access-token → ticket exchange** (the HTTP endpoint) validates the Bearer access token and issues
  a ticket bound to that user — implemented in 3.6.
- **Persisted signing keys / multi-instance** (from 3.3) also matters for a multi-node sync tier; the
  in-memory ticket store would then need a shared backend (e.g. Redis).
