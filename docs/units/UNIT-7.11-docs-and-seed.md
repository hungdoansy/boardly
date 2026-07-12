# UNIT-7.11 — Docs: rewrite PLAN.md + DESIGN + units index; rewrite the demo seed

Part of plan `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md` (Unit 11).
Satisfies R8. This unit has **no app-code behavior change**: it makes the app-level documentation
describe the collapsed, fixed-status-column, full-featured app that Units 1–10 shipped, and rewrites
the demo seed to the per-user single-doc model.

## What changed

- **`PLAN.md`** — retired the multi-board framing. It now documents Boardly as a **single-user,
  self-hosted, one-space-per-user** product:
  - New **Architecture** section: one Yjs content doc per user, room `board:{userId}`, **authorized
    purely by identity** (room id == authenticated user id; no `boards` table, no `/boards` route,
    no workspace index, no client-chosen board id); per-account local IndexedDB isolation; no
    `boardId` on the command surface; **reset, not migrated**; the sync/persistence model; the
    agent-native command layer (UI + REST + MCP share the catalog).
  - **Feature set** rewritten: the eight fixed Linear status columns (Backlog…Duplicate, no
    add/rename/reorder/WIP), a card's column **is** its status, drag-applies-status, the synced
    show/hide-empty-columns toolbar toggle, projects as the grouping axis, integer ticket numbers
    with a display-only board-level prefix (`#id` / `PREFIX-id`), Linear-style ticket URLs, the
    card-face link cluster + drawer link reordering, the settings view, the sidebar with Settings as
    the last nav item above the account button, and the ESC escape ladder.
  - Updated the monorepo layout (added `commands`, `mcp`, corrected `sync`), the tech-stack (Hono +
    Hocuspocus + REST/MCP), the data-&-sync section (import/export projects gap noted), the "Later"
    list, and the roadmap (added Phase 5 "product pivots" and reframed Phase 6 as polish/ship).
- **`docs/design/DESIGN.md`**
  - §2 "Encodings → Workflow status": replaced the six-row table with the **eight** fixed statuses in
    `STATUS_ORDER`, mirroring `packages/domain/src/status.ts` `STATUS_META` exactly — colors
    (Backlog `#8A8F98`, Todo `#A0A4AD`, In Progress `#F2C94C`, **Pending `#E2B341` amber**, In Review
    `#4CB782`, Done `#5E6AD2` accent, Canceled `#6B7080`, **Duplicate `#565B66` gray**), categories,
    and icons; added the note that status is the single placement axis / a card's column is its
    status, and that completed/canceled cards dim + strike. Removed the stale `R14` reference.
  - §5 "Focus & keyboard": added the **ESC escape ladder** bullet (yields to dialogs/edits/drags;
    else exit Settings; else reset scope to All).
  - §8 "Key screens": rewrote **App shell** (single space, sidebar order logo → Search → projects →
    **Settings** (last) → account/theme footer) and **Board view** (eight fixed non-editable status
    columns, show/hide-empty toolbar toggle, drag-applies-status, Todo-default composer).
- **`docs/units/README.md`** — added a **Plans → unit-doc ranges** index that maps each plan to its
  unit-doc ids, including the full `UNIT-7.1` … `UNIT-7.11` list for this plan (7.11 is this doc).
- **`packages/sync/scripts/seed-demo-board.ts`** — rewritten to the per-user single-doc model.
- **`packages/sync/scripts/add-brand-showcase-card.ts`** — **fixed** (not removed) to the same model.

## Why

- **Docs reflect reality (R8).** After Units 1–10 the running app no longer matches the old PLAN.md
  (multi-board, user-managed columns, WIP limits, a board-list rail). Treating `PLAN.md` as the
  single source of truth for "what Boardly is now" required a rewrite, not a patch. DESIGN.md's status
  encodings and key-screens were likewise stale.
- **Colors/order mirror code, never invented.** The status table is copied from `STATUS_META` /
  `STATUS_ORDER` in `packages/domain/src/status.ts` (the source of truth Units 7 established), so the
  design doc and the code can't drift; the new `pending` (amber `#E2B341`) and `duplicate`
  (gray `#565B66`) tokens are exactly the code's values.
- **Seed follows the collapsed model.** The board layer collapse (Units 1–2) removed the workspace
  index doc, the `boards` table, and `POST /boards`. The old seed's registration / adopt-or-reset /
  foreign-ref logic existed **only** for that board registry, and its `addColumn`/`columnId`/
  `liveColumns`/`workspace-doc` imports no longer exist. The rewrite connects the demo user's single
  doc `board:{demoUserId}` directly and seeds it if empty — idempotent adopt-or-skip.
- **`add-brand-showcase-card.ts`: fixed, not removed.** It is a genuinely useful design-verification
  aid — one card carrying a link for every provider the registry detects, exercising every
  `ProviderIcon` branch at once (see `DESIGN.md` §7). Nothing references it except docs, so removing
  it would only lose that utility. It was cheap to port: drop the `./workspace-doc`/`listBoards`/
  `liveColumns` imports and the board-discovery, connect `board:{userId}` directly, and create the
  card with `addCard({ status: Status.Backlog })` instead of `{ columnId }`. (This supersedes the seed
  description in `docs/units/UNIT-P2-demo-seed-script.md`, which documents the pre-collapse scripts.)

## How the rewritten seed works

`seed-demo-board.ts`:

1. **Auth** — `POST /auth/login` (or sign up then log in); the `userId` is the JWT `sub`.
2. **Connect** — a single `HocuspocusProvider` for document `board:{userId}` over `/sync`, using a
   one-time ticket from `POST /sync/ticket`. The room authorizes purely by identity — no board
   registration step.
3. **Idempotent adopt-or-skip** — only build when `allLiveCards(boardDoc).length === 0`; a re-run
   against a populated doc keeps content as-is (no duplicate cards). The old `SEED_RESET` rebuild
   path (which archived board refs / minted a new board) is gone — there is nothing to switch between.
4. **Build** — `initBoard` (title + `BRD` prefix + default badge config), `setBadgeConfig`, labels,
   projects, then cards. Each card's placement is its **status**, set directly via
   `addCard({ status })`. Cards are spread across **all eight** fixed statuses (two each in Backlog /
   Todo… incl. one **Pending** and one **Duplicate**) so the seeded board exercises every status
   column and the show/hide-empty toggle. Priority/severity/due/labels/links/checklists and three
   saved views (board + list lenses, grouping/sort/filter) round it out.

Env overrides unchanged where still meaningful: `API_URL`, `SEED_EMAIL`, `SEED_PASSWORD`,
`BOARD_TITLE`. `add-brand-showcase-card.ts` shares the same connect/auth shape and appends one
all-providers card in Backlog.

## How to test / verify

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Scripts compile.** They are outside the sync package `tsc` include (`include: ["src"]`), so they
  were type-checked directly with a scratch tsconfig extending `packages/sync/tsconfig.json` and
  including `["src","scripts"]` → **clean, no errors**.
- **No removed imports remain.** `grep -rn "workspace-doc\|addBoardRef\|archiveBoardRef\|
  registerBoard\|listBoards\|columnId\|addColumn\|liveColumns\|setColumnWipLimit\|getWorkspaceDoc"
  packages/sync/scripts/` → **empty**.
- `pnpm --filter @boardly/sync run typecheck` → **green**.
- `pnpm turbo run typecheck --continue` → **every package green except** the known, pre-existing
  `@boardly/e2e` `tests/focus-mode.spec.ts` DOM-lib errors (`getComputedStyle`/`document`), which are
  unrelated to this unit and were red before it (reported, not fixed).
- **Live seed run: NOT executed here.** No demo credential/env was available in this environment, and
  running the seed needs a live server + Postgres + is subject to the auth rate limit. Manual
  verification step: with the stack up, run
  `apps/server/node_modules/.bin/tsx packages/sync/scripts/seed-demo-board.ts`, then log in at
  `http://localhost:3000` and confirm one populated space with cards across all eight status columns,
  no `POST /boards` request in the network panel, and a re-run leaving the content unchanged.

## Follow-ups / known gaps

- Live seed + dark-mode screenshot verification is deferred to the orchestrator (no demo credentials
  in this environment).
- Import/export still does not carry projects (pre-existing, `UNIT-6.6`) — noted in `PLAN.md`.
- `docs/units/UNIT-P2-demo-seed-script.md` still describes the pre-collapse seed as a historical
  record; the current seed behavior is documented here and in the script header.
