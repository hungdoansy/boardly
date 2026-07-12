# UNIT-7.5 — Web data layer: per-user doc keyed by the authenticated user; simplify sync-bridge

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 5). Satisfies R1, R3, R5.

## What changed

The web client now builds its `CommandContext` from the **authenticated user id** and syncs a **single** per-user content doc — there is no board list, no board-entity hooks, no ownership registration, and no reconcile loop.

- **`apps/web/lib/boardly-context.tsx`**
  - Dropped the `LOCAL_USER = "local"` constant and the module-level `singleton`/`defaultContext()`.
  - `BoardlyProvider` now reads `useAuthSession().userId` and builds the client context with `createClientContext({ userId, clientId })`, where `clientId` comes from the per-user doc handle (`getBoardDoc(userId).doc.clientID`). Memoized on `[context, userId]`.
  - The provider renders `null` until a userId exists (it sits below `<AuthGate>`, so a real userId is always present; the guard only covers the transient loading frame and never fires when a test passes an explicit `context`).
  - Import switched from `getWorkspaceDoc` to `getBoardDoc` (`@boardly/sync/client`).
- **`apps/web/components/sync/sync-bridge.tsx`** — reduced from three effects (workspace doc + registration reconcile + open-board doc) to **one**: attach `board:{userId}` over the socket after local hydrate. Removed the workspace-doc attach, the `registerBoard` reconcile loop, `useBoards`/`useSelectedBoard`, and the `boardsRef`.
- **`apps/web/lib/use-boards.ts`**
  - **Deleted** the board-entity hooks `useBoards`, `useBoardActions`, `useSelectedBoard`, `useEnsureBoard`, plus `MAIN_BOARD_ID`/`MAIN_BOARD_TITLE` and the `apiClient.registerBoard` call.
  - **Kept** the ticket-URL routing hooks (`useSelectedCard`, `useSettingsRoute`, `useOpenCardNav`) with `boardId` dropped: `writeCardHash(ctx, cardId)` resolves the board id off `ctx.userId`; `useOpenCardNav()` now returns `(cardId) => void`.
  - **Added** `useSeedDefaultBoard()` — the interim, hydration-gated default seed (see UNIT-7.6 for rationale; it lives here because this file already owns the boot/routing helpers).
  - File kept its name (rename was optional per the plan) since it still holds board-scoped routing + the boot seed.
- **`apps/web/lib/api-client.ts`** — removed `registerBoard` and the now-unused `listBoards` (both only served the deleted `POST /boards`/board-list surface).

## Why

- **Per-account keying (R5):** the old shared `LOCAL_USER` key meant every account opened the *same* local IndexedDB doc, so content leaked across accounts. Keying by `useAuthSession().userId` gives each account its own local room — the leak is closed by construction. `BoardlyProvider` is under `<AuthGate>`, so the userId is always available where the context is built.
- **One doc, one room (R1, R3):** Boardly is single-board; the content doc is addressed by the user id (`board:{userId}`) and authorized server-side by identity (Unit 2). The workspace index doc, the board-registration handshake, and the reconcile loop are all redundant and were removed.
- **Delete, don't stub:** the board-entity hooks had no meaning without a board list; leaving no-op shells would be dead complexity.

## How it works

`BoardlyProvider` (below `<AuthGate>`) constructs `createClientContext({ userId, clientId })`; `ctx.getBoardDoc()` resolves to the sync registry's per-user handle (`getBoardDoc(userId).doc`). `SyncBridge` waits for `getBoardDoc(userId)`'s local IndexedDB hydrate, then attaches a single Hocuspocus provider for `board:{userId}` with a per-connect ticket. Signing out and into a different account changes `userId`, so both the local doc and the sync room change — no cross-account bleed.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web run typecheck` → **green**.
- `pnpm --filter @boardly/web run lint` → clean.
- `pnpm --filter @boardly/web run test` → **30 files, 161 tests, all passing** (covers the retained ticket-URL routing hooks in `use-boards.test.tsx`).

Scenarios covered by the suite / manual expectation:
- The context resolves the signed-in user's doc; two different user ids resolve different local rooms (keying is by `userId`).
- `sync-bridge` attaches exactly one room (`board:{userId}`) and fires no `POST /boards`.
- Ticket deep-link routing round-trips on the per-user doc (`use-boards.test.tsx`).

Live in-app verification (single synced space, one sync room in the network panel, no `POST /boards`, no cross-account leak) is pending at the orchestrator level.

## Follow-ups / known gaps

- `useSeedDefaultBoard` is **interim** and removed in Unit 9 when columns become fixed statuses (see UNIT-7.6).
- The per-account local doc closes the local leak; the server-side identity authz (Unit 2) closes the sync-room side. No data migration — existing docs are abandoned per the plan's reset posture (R7).
