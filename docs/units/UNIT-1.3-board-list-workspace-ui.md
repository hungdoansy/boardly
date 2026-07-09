# UNIT 1.3: Board list / workspace UI

- **Plan unit:** 1.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R5 (core board), R1 (offline-first)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-1.3-board-list-dark.png`

## What changed

Create / rename / archive / open boards from the workspace index doc — the first live,
Yjs-backed, command-driven UI.

- `apps/web/lib/boardly-context.tsx` — `BoardlyProvider` + `useBoardlyContext`. Supplies the
  `CommandContext` to the tree; the real app builds a client context (sync provider registry, user
  `"local"` until auth), tests inject an in-memory context.
- `apps/web/lib/use-boards.ts` — `useBoards()` (live `WorkspaceBoardRef[]` via `useY` on the
  workspace `boards` map, `deep`), `useBoardActions()` (create/rename/archive — **all via
  `execute(command, ctx, …)`**), and `useSelectedBoard()` (client-resolved from the `#board/<id>`
  URL hash).
- `apps/web/components/board/board-list.tsx` — the rail: "Boards" header + New-board button, empty
  state, board rows (select on click, inline rename on double-click, archive on hover), active
  highlight.
- `apps/web/components/app/workspace-app.tsx` — client shell (`WorkspaceApp` → `BoardlyProvider` →
  `Shell`): rail (wordmark, search affordance, `BoardList`, account) + a selection-aware main area
  (empty state with Create, or the selected board's title placeholder until Unit 1.4).
- `apps/web/app/page.tsx` — now renders `<WorkspaceApp/>`.
- Creating a board runs `createBoard` then three `addColumn` commands → default columns
  **To Do / Doing / Done**.
- `packages/sync` `attachIndexedDb` now **no-ops when `indexedDB` is undefined** (SSR/static
  prerender), so the doc-backed UI is safe to render on the server; persistence attaches for real on
  the client (`persistence` is nullable; provider `destroy` guards it).
- Tests: `board-list.test.tsx` (jsdom, RTL). Web is now a Vitest project (its own
  `apps/web/vitest.config.ts`, added to the root projects) with a `test` script. Web deps gain
  `@boardly/commands` and `@boardly/sync`.

## Why (decisions)

- **Everything through the command layer.** The UI never calls `@boardly/sync` mutators directly —
  create/rename/archive go through `execute(createBoard|renameBoard|archiveBoard, ctx, …)` (+
  `addColumn`), so the agent has exact parity (R13). Reads use selectors via `useY`.
- **Default columns composed in the UI hook**, not baked into `createBoard`. Keeps the command a
  primitive; the "new board starts with 3 columns" policy is a UI convenience (an agent can compose
  the same primitives).
- **`CommandContext` via React context** makes the whole tree testable: inject a `createMemoryContext`
  in tests, use the registry-backed client context in the app.
- **SSR-safe IndexedDB.** Static export prerenders client components in Node (no IndexedDB).
  No-op-ing `attachIndexedDb` there lets `getWorkspaceDoc` run during prerender (empty doc), and the
  first client render is also empty (async hydrate) → **no hydration mismatch**; boards appear once
  IndexedDB loads.
- **Hash routing** (`#board/<id>`) for board selection — no per-id server route (static export),
  no `useSearchParams`/Suspense plumbing.

## Design (per DESIGN.md)

- Rail on `--bg-surface`; rows are `text-base`, quiet until hover (`--bg-overlay`); the **active**
  board uses `--bg-selected` + an accent status dot; the archive affordance fades in on hover
  (`opacity` transition, `--dur-fast`). Inline rename input uses an accent ring. One accent, dense
  spacing, `focus-visible` rings on every control — all tokens, no hardcoded values.
- Dark screenshot: `docs/units/screenshots/UNIT-1.3-board-list-dark.png` (Product/Engineering/Design;
  Product active).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web test` (4): empty state; **create → board appears + 3 default columns**
  (asserted against the injected context's board doc); inline rename; archive removes from the list.
- **Critical flow (Playwright, dark):** served `out/` → create 3 boards, rename them, select one →
  screenshot matches DESIGN.md; **reload → all 3 boards persist** (offline IndexedDB round-trip),
  0 console errors.
- Full gates: `pnpm turbo run typecheck` (7/7), `lint` (7/7), `test` (41 total across 5 projects),
  `pnpm --filter @boardly/web build` (static export valid), `format:check` clean.

## Follow-ups / known gaps

- The main area is a **placeholder** — columns & cards render in Units 1.4 / 1.5; selecting a board
  currently shows its title only.
- Search affordance + ⌘K are visual (palette is Unit 2.9); account row is static (auth Phase 3).
- No card counts in the rail yet (would require reading each board doc; revisit if useful).
- `favicon.ico` still missing (minor).
