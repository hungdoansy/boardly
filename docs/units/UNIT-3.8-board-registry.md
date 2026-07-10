# UNIT 3.8: Board ownership registry reconciliation

- **Plan unit:** 3.8 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R3, R9
- **Dependencies:** 3.3 (auth), 3.5 (sync authz), 1.3 (board list) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Creating a board now registers its ownership server-side, which is what the Unit 3.5 sync authz reads
— so board **content** docs can finally sync across a user's devices.

- `apps/server/src/routes/boards.ts` — Bearer-authed ownership registry:
  - `POST /boards {id, title}` — insert the `boards` row (id chosen client-side = the Yjs room).
    Idempotent for the owner (updates title → `200`), `201` on first insert, **`409` if the id is
    already owned by another user**.
  - `GET /boards` — the user's non-archived boards (for login reconciliation).
  - `POST /boards/:id/archive` — soft-archive, ownership enforced (`404` for a non-owner).
- `apps/server/src/auth/bearer.ts` — `authenticateBearer(request, keys)` shared helper; `ticket.ts`
  refactored to use it.
- `apps/server/src/app.ts` — mounts `/boards` when `database` + `keys` are present.
- `apps/web/lib/use-boards.ts` — `useBoardActions.create` registers the board (`apiClient.registerBoard`)
  right after creating it locally.
- `apps/web/lib/api-client.ts` — `registerBoard` / `listBoards` (offline-tolerant: never throw).
- `apps/web/components/sync/sync-bridge.tsx` — now also (2) **reconciles** by registering every local
  board on login (offline-created boards get their row on the next connection) and (3) attaches the
  **open board's content doc** to `/sync` (after registering it), so board content syncs.
- Tests: `apps/server/src/routes/boards.test.ts`.

## Why (decisions)

- **Ownership lives in Postgres, keyed by the client-chosen board id.** The board id is the Yjs sync
  room; registering the `boards` row is the single source of truth the sync server (3.5) and future
  REST/MCP (3.9) authorize against. No server-generated id to reconcile — the client picks it and
  claims it.
- **Idempotent register, hard reject on conflict.** Re-registering your own board just refreshes the
  title (safe to call on every login and every create); registering an id already owned by someone
  else is a `409` — an attacker can't claim another user's room (and 3.5 authz would reject the sync
  anyway; tested both).
- **Reconciliation on login covers offline creation.** A board created offline has no server row yet;
  `SyncBridge` registers every local board once authenticated, so it's claimed on the next
  connection. `registerBoard` is offline-tolerant (never throws) so create/reconcile are fire-and-forget.
- **Register-then-attach for the open board.** The per-board sync effect awaits `registerBoard` before
  attaching the provider, so the ticket request can't `403` on a not-yet-registered board.
- **Only the open board's content syncs** (plus the always-on workspace list) — matches Linear's
  "sync what you're viewing" and avoids opening a socket per board.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Integration (Docker, real db):** `boards.test.ts` — registering ownership lets the owner
  authenticate the board's sync room (ties to 3.5); idempotent re-register + list; **a second user
  cannot claim an owned id (`409`) and cannot open its room**; archive works and 404s for a non-owner;
  unauthenticated → `401`, malformed → `400`. Run:
  ```sh
  docker compose up -d db
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test
  ```
  65 server tests pass.
- **Full-app e2e (Playwright, dark, Docker + server + build):** created a board (auto-registered —
  confirmed `boards` row + `board:<id>` state persisted, 1259 bytes), added a card, **wiped local
  IndexedDB**, reloaded the board — the columns **and** the card were **restored from the server**
  (board-content sync, the core promise from 3.6 now unblocked). Screenshot:
  `docs/units/screenshots/UNIT-3.8-board-sync-dark.png`.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test` (server 65 / web 92 /
  sync 27 / …), `pnpm --filter @boardly/web build`, `pnpm format:check` — all green.

## Follow-ups / known gaps

- **REST command API (3.9)** reuses this ownership check to authorize agent/script writes.
- **Archive reconciliation** is one-directional (client → server on demand); a server-archived board
  isn't yet pushed back to the workspace doc. Revisit if archive becomes multi-device-initiated.
- **Per-board socket lifecycle**: only the open board syncs; switching boards tears down the previous
  board's provider. Background sync of recently-viewed boards is a possible later optimization.
