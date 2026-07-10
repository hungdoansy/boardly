# UNIT 3.6: WS-ticket endpoint + client network provider wiring

- **Plan unit:** 3.6 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R3, R1
- **Dependencies:** 3.5 (sync server), 1.2 (local persistence/provider) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Clients now obtain a single-use ticket over HTTP and attach a network provider to the sync server
**after local hydrate**, enabling multi-device sync of the workspace (board list).

- `apps/server/src/routes/ticket.ts` — `POST /sync/ticket`: verifies the Bearer access token,
  authorizes the requested document (board owner / own workspace), and returns a single-use ticket
  bound to `{userId, documentName}` (`expiresInMs`).
- `apps/server/src/sync/ticket-store.ts` — tickets now bind a `documentName` too; `consume` returns
  `{userId, documentName}`.
- `apps/server/src/sync/authz.ts` — after consuming, the ticket's `documentName` must equal the
  connecting document (a ticket for board A can't open board B), then the ownership check runs.
- `apps/server/src/app.ts` — `buildServer` mounts `/sync/ticket` when given `database`+`ticketStore` +`keys`; `index.ts` passes them (shared ticket store with the sync server).
- `apps/server/src/sync/hocuspocus.ts` — **rewired** to use the Hocuspocus `Server` (v4 speaks
  `crossws`); `attachSyncServer` feeds Fastify's upgrades into `server.crossws.handleUpgrade` (the
  previous raw-`ws` wiring connected but never completed the handshake). Removed the direct `ws` dep.
- `packages/sync/src/provider.ts` — `boardDocName`/`workspaceDocName` (server room names) and
  `attachNetwork(handle, {documentName, url, getTicket, onAuthFailed, createProvider?})`: awaits
  `handle.whenSynced`, then creates a `HocuspocusProvider` whose **`token` is a function** — so every
  (re)connect re-mints a fresh ticket. Injectable `createProvider` for tests.
- `apps/web/lib/api-client.ts` — `SYNC_WS_URL` (derived from the API origin) + `getSyncTicket`
  (POST `/sync/ticket` via `authFetch`, so it rides the Bearer + refresh-once path).
- `apps/web/components/sync/sync-bridge.tsx` — `SyncBridge`: once authenticated, attaches the
  workspace doc to `/sync` (server name `workspace:<userId>`), tearing down on logout/unmount.
  Mounted in `WorkspaceApp`.
- Deps pinned: `@hocuspocus/provider 4.3.0` (sync). Tests: `packages/sync/src/provider.test.ts`,
  `apps/server/src/routes/ticket.test.ts`.

## Why (decisions)

- **Ticket bound to `{userId, documentName}`.** Belt-and-suspenders over the sync-time ownership
  check: even a valid ticket can only open the exact document it was minted for.
- **`token` as a function = free reconnect re-mint.** `HocuspocusProvider` calls the token function
  on each (re)connect, so a dropped connection transparently mints a new single-use ticket — no
  bespoke reconnect logic. An auth rejection closes terminally (4403), so there's no reconnect storm.
- **Attach only after `whenSynced`.** Local IndexedDB hydrates first and the UI renders local state,
  then the network attaches — no content flash (the plan's happy path).
- **Hocuspocus `Server` + crossws, not raw `ws`.** v4 routes connections through `crossws`
  (`handleConnection(peer.websocket, peer.request)` with a web `Request`); a raw `ws` socket +
  node `IncomingMessage` connects but the sync handshake never completes. Reusing the Server's
  crossws adapter is exactly what `Server.listen` does — correct peer/message/close semantics for free.
- **Local room key ≠ server document name.** The app keeps its IndexedDB room (`boardly:workspace:local`)
  while the network doc name is `workspace:<userId>`; the same `Y.Doc` gets both local persistence and
  network sync, so two devices of one user converge without disturbing the local partitioning.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit:** `pnpm --filter @boardly/sync test` — `provider.test.ts` (mocked): `attachNetwork` does
  not connect until `whenSynced`; passes the right name/url/doc; the token function re-mints a ticket
  on every call; `destroy` tears down. `pnpm --filter @boardly/server test` — `ticket.test.ts`
  (real db): issues a ticket for an owned board that then authenticates a sync connection end-to-end;
  own workspace ok; non-owner / other workspace → 403; missing/invalid Bearer → 401; malformed doc
  name → 400.
- **Two-client live sync (library level):** two `HocuspocusProvider`s (same user, `workspace:<id>`)
  against the running server both reach `synced`, and edits propagate **A→B and B→A** through the
  server + Postgres.
- **Full-app e2e (Playwright, dark, Docker + server + build):** signed up in the app, created a board
  (persisted to `yjs_documents` server-side, 195 bytes), **wiped local IndexedDB**, reloaded — the
  silent refresh re-authed, `SyncBridge` attached, and the board list was **restored from the server**
  (offline→online backfill). Screenshot: `docs/units/screenshots/UNIT-3.6-sync-restore-dark.png`.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test` (sync 27 / server 47 /
  web 92), `pnpm --filter @boardly/web build`, `pnpm format:check` — all green.

## Follow-ups / known gaps

- **Board _content_ sync needs `boards` rows.** `SyncBridge` bridges the workspace (board list) doc
  now; syncing each `board:<id>` doc requires its `boards` row to exist — **Unit 3.8** (board
  ownership registry reconciliation) creates them, after which board content syncs across devices too.
- **Two-browser-context UI e2e** was verified as library-level two-client convergence + app-level
  server-backed restore (the MCP browser is single-context). A full two-context Playwright run can be
  added with 5.4's e2e suite.
- **In-memory ticket store** (from 3.5) must move to a shared backend (e.g. Redis) for a multi-node
  sync tier; single-instance dev is fine.
