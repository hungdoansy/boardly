# UNIT-6.2 — Single main board (auto-provision + remove board creation)

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 2).

## What changed

Boardly is now locked to a single, auto-provisioned board. There is no UI to create or archive additional boards.

- **`apps/web/lib/use-boards.ts`**
  - Added `MAIN_BOARD_ID = "main"` (deterministic) and `MAIN_BOARD_TITLE = "Main board"`.
  - Added `useEnsureBoard()` — provisions the one board on first run and keeps a valid board selected. It **waits for the workspace doc to hydrate from IndexedDB** (`getWorkspaceDoc(LOCAL_USER).whenSynced`) before deciding the workspace is empty, so a returning user's persisted board isn't shadowed by a phantom one.
  - `useBoardActions.create(title?, id?)` now accepts an optional id and only seeds the default columns when the board has none yet (`liveColumns(...).length === 0`) — idempotent across reloads and across a well-known board.
- **`apps/web/components/app/workspace-app.tsx`** — calls `useEnsureBoard()` in `Shell`; the "No board selected / Create board" empty state is replaced by a small loading spinner (a board is always being provisioned/selected). Removed the now-unused `Plus` import and `createAndOpen`.
- **`apps/web/components/board/board-list.tsx`** — rewritten to a read-only single-board list: no `+ New board`, no archive, no inline rename. Keeps the `nav[aria-label="Boards"]` landmark (auth waits on it) and highlights the selected board.
- **`apps/web/components/board/board-list.test.tsx`** — rewritten: lists the one seeded board, asserts no create/archive affordances, asserts the Boards landmark.
- **e2e** — `helpers.ts` `createBoard` no longer clicks anything; it just waits for the auto-provisioned board + default columns. `auth.spec.ts` asserts the board is present (Add column visible) and the "Create board" CTA is gone.

## Why

- Product decision (user): one main board, and no ability to create more (R1, R2).
- **Deterministic board id** so two devices that each provision independently converge on a single workspace entry (the workspace index is an id-keyed Y.Map) instead of showing phantom duplicates.
- **Hydration gate** because the workspace doc loads from IndexedDB asynchronously; without it the first render sees an empty workspace and provisions a board that then collides with the persisted one (observed during verification — see below).
- The multi-board data model and `createBoard` command are intentionally **kept** (used by provisioning, seeding, and tests) — only the UI entry points are removed.

## How it works

On mount, `useEnsureBoard` awaits the workspace doc's IndexedDB hydration. Once hydrated: if there are no boards it creates the single `MAIN_BOARD_ID` board (seeding default columns + registering server ownership) and selects it; otherwise it just ensures a valid board stays selected. A `creating` ref guards against a double-create before the doc update propagates (React strict-mode / re-renders).

## How to test / verify

- Unit tests (green): `pnpm --filter @boardly/web test` (144 passed) — incl. `board-list.test.tsx` (lists one board; no create/archive controls; Boards landmark present).
- Typecheck + lint + static build: green (`@boardly/web`). e2e typecheck shows only the pre-existing unrelated `focus-mode.spec.ts` DOM-lib errors.
- **Browser (dark mode, verified live against the running server+DB):** signed up a fresh session → the app landed directly on an auto-provisioned **"Main board"** with **To Do / Doing / Done** columns and **no** "Create board" CTA, no `+ New board`, and no archive controls. Adding a card showed the Unit-6.1 id `#1`.
- **Provisioning race caught & fixed during verification:** on a persisted store the first version created a phantom "Main board"; after adding the IndexedDB hydration gate, reloading a non-empty store creates no extra board.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

## Follow-ups / known gaps

- **Multi-device seeding:** a second device with an empty local store provisions `main` before the server board syncs in; the board entry merges to one (deterministic id), but default columns can briefly duplicate on merge because the column-seeding guard sees an empty board doc at provision time. Acceptable for the single-user target (project memory `boardly-v2-direction`); a full fix would gate provisioning on the server sync too. Not addressed here.
- **Shared local doc:** the local docs are keyed by `LOCAL_USER` ("local") regardless of the signed-in account, so boards from a prior account/session persist locally and can sync up to a new account. Pre-existing quirk; "reset is fine (in-dev)" covers it. Extra pre-existing boards are not auto-removed (no delete UI); a reset yields the clean single-board state.
- Renaming the single board has no UI yet (double-click rename was removed); a rename control can live in Unit 8 settings if desired.
