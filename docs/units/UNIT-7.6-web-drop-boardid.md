# UNIT-7.6 — Web hooks + components: drop `boardId`, remove provisioning/selection

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 6). Satisfies R4, R6.

## What changed

Every web hook, component prop, and command call lost its `boardId`; the board-provisioning/selection UI is gone; the app renders the single per-user doc directly. This is a behavior-preserving mechanical change (R6) except for the removal of board list/provisioning/selection and the new interim column seed.

- **Hooks (`apps/web/lib/use-board.ts`, `use-projects.ts`, `use-views.ts`)** — dropped the `boardId` first arg from every hook (`useColumns`, `useCardCounts`, `useBadgeConfig`/`useSetBadgeConfig`, `useTicketPrefix`/`useSetTicketPrefix`, `useLabels`/`useLabelActions`, `useReclaimedCards`, `useCardsInColumn(columnId)`, `useAllCards`, `useCardById(cardId)`, `useCardActivity(cardId)`, `useCardActions`, `useChecklistActions`, `useLinkActions`, `useColumnActions`, `useProjects`/`useProjectActions`, `useSavedViews`/`useViewActions`). Each now calls `ctx.getBoardDoc()` (no arg) and drops `boardId` from its `execute(...)` inputs and `useCallback` deps. The two reads that need the board id for `getBoard(doc, userId)` (`useBadgeConfig`, `useTicketPrefix`) pass `ctx.userId ?? ""`. **Added** `useBoardTitle()` for the header (reads `getBoard(doc, ctx.userId ?? "").title`).
- **`apps/web/components/app/workspace-app.tsx`** — removed `useEnsureBoard`/`useBoards`/`useSelectedBoard`. `Shell` calls `useSeedDefaultBoard()` and no longer threads a `boardId`. `MainArea` no longer looks up an "active" board: the board always exists, so the loading-spinner branch and all `active ? … : null` toolbar guards are gone; the header title comes from `useBoardTitle()` (falling back to "Boardly"). Settings/ProjectList/toolbar children render unconditionally.
- **Board components** — dropped `boardId` from props and hook calls in `board/board-view.tsx`, `dnd.tsx` (`BoardDndProvider` takes only `children`; `moveCard`/`moveColumn` inputs lose `boardId`), `column-cards.tsx`, `swimlanes.tsx`, `list-view.tsx`, `project-list.tsx` (now props-less), `views.tsx` (`ViewsMenu` takes `{ active, onChange }`), `label-manager.tsx`, `badge-config.tsx`, and `import-export.tsx` (`ImportExportMenu` takes only `boardTitle`; export/import always target the one doc; dropped the `boardId`/`onImported` props and the "imports into a new board" copy → "into this board").
- **Card components** — `card/card-detail.tsx` (`CardDetail` takes `{ cardId, onClose }`; sub-editors get no `boardId`), `checklist.tsx`, `labels.tsx`, `links.tsx`, `activity.tsx`.
- **Settings** — `settings-view.tsx` (`SettingsView` takes only `onClose`), `general-settings.tsx`, `project-settings.tsx` (all props-less).
- **Search / palette** — `search/use-search.ts` rebuilt over the **single** per-user doc (one `update` subscription; `boardTitle` from `getBoard`); `search/search-index.ts` `SearchDoc` dropped its `boardId` field; `search/search.tsx` and `command-palette/palette.tsx` call `openCard(cardId)`. The palette drops `useSelectedBoard`; the Actions group + `NewCardItem` render unconditionally (the board always exists).
- **Tests** — all affected component/hook tests dropped `boardId` from fixtures/props/command inputs, replaced the removed `createBoard` setup with `initBoard(ctx.getBoardDoc(), { title, now: 0 })` from `@boardly/sync`, and switched `ctx.getBoardDoc(id)` → `ctx.getBoardDoc()`.
- **e2e** — no changes were needed: `apps/e2e` used no `boardId` plumbing, and its `createBoard(page)` helper already just waits for the seeded default columns (still provided by the interim seed).

## Default-column seeding (interim)

The old `useEnsureBoard` provisioned a board and seeded To Do/Doing/Done via the (now-removed) `createBoard` command. Provisioning is gone — an empty per-user doc **is** a valid empty board. But while columns are still user-managed (Phase 3), a brand-new user needs at least one column to place cards, so `useSeedDefaultBoard()` (in `use-boards.ts`, called once from `Shell`) retains a **minimal, hydration-gated seed**:

- waits for `getBoardDoc(userId).whenSynced` (local IndexedDB hydrate) so it never seeds over persisted content;
- only acts when `liveColumns(doc).length === 0`, guarded by a `seeding` ref against double-fire;
- calls `initBoard(doc, { title: "Main board", now })` (idempotent; seeds the board title + `DEFAULT_BADGE_CONFIG` so the header and card faces match prior behavior — R6) and then `execute(addColumn, …)` for the three default columns.

**This seed is interim and will be removed in Unit 9**, when columns become the fixed status set (a brand-new user will then simply see the eight empty status columns). The direct `initBoard` call is the one accepted deviation from "mutations go through the command layer" — it is boot/provisioning code standing in for the deleted `createBoard` command, and it disappears with the seed.

## Why

- **Drop `boardId` (R4):** the command context resolves the single doc from the authenticated user (Unit 3), so threading a board id through every hook/prop/component was pure vestigial plumbing.
- **Remove provisioning/selection (R6 exception):** with one board there is nothing to create, select, or switch; the "active board" lookups, the loading gate, and the `select`/`onImported` callbacks had no meaning. This is the change that resolves the demo/`main-board` symptom — a signed-in user sees exactly their one synced space.
- **Behavior parity elsewhere (R6):** columns remain user-managed here (they become fixed statuses in Unit 9); every other flow (cards, drawer, links, projects scope, labels, views, filters, search, palette, focus, import/export, settings) is unchanged apart from losing the redundant `boardId`.

## How it works

`BoardlyProvider` supplies a per-user `CommandContext`. Components call board-scoped hooks with no id; each hook does `useBoardlyContext().getBoardDoc()` and runs the same `@boardly/sync` selectors/commands as before. `MainArea` renders the board unconditionally (title via `useBoardTitle`). On first load, `useSeedDefaultBoard` seeds the interim default board once, after hydrate, when empty.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web run typecheck` → **green**.
- `pnpm --filter @boardly/web run lint` → clean.
- `pnpm --filter @boardly/web run test` → **30 files, 161 tests, all passing** (board/list/swimlane/column, card drawer + sub-editors, settings, search, palette, ticket routing — all with `boardId` gone).
- Full monorepo typecheck (`pnpm turbo run typecheck --continue`) → **7/8 packages green**. The only failure is a **pre-existing, unrelated** error in `apps/e2e/tests/focus-mode.spec.ts` (`getComputedStyle`/`document` not in the e2e tsconfig `lib`); it fails identically on a clean tree (verified by stashing this unit's changes) and touches no file changed here.

Live dark-mode screenshot verification of the single space (and a second login for the same account showing the same synced content) is **pending at the orchestrator level**.

## Follow-ups / known gaps

- **Interim column seed** (`useSeedDefaultBoard`) is removed in Unit 9 when columns become fixed statuses.
- **Swimlanes/list still key off `columnId`** — unchanged here; the column→status collapse (Units 7–9) reworks grouping to status.
- **Import/export still doesn't carry projects** — a pre-existing gap (UNIT-6.6), unchanged.
- The pre-existing `apps/e2e/focus-mode.spec.ts` DOM-lib typecheck error is out of scope for this refactor and left as-is.
