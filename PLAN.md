# Boardly — Project Plan

A performant, offline-first kanban app for **desktop + responsive web**, inspired by the Obsidian
kanban plugin, with **Linear-style UX**. Local data is the source of truth; changes sync across a
single user's devices when online.

Boardly is a **single-user, self-hosted** product: each user owns exactly **one space** (one board).
There is no board list, no board switching, and no multi-user collaboration. In-app grouping is done
with **projects**, not multiple boards, and the columns are the **fixed Linear workflow statuses**.

> This document is the source of truth for _what Boardly is now_. The current shape is the result of
> collapsing the original multi-board design into one per-user space and adopting fixed status
> columns — see `docs/plans/2026-07-12-002-refactor-collapse-board-linear-columns-plan.md`
> (units `docs/units/UNIT-7.1-*.md` … `UNIT-7.11-*.md`) and the projects/ticket-id/settings work in
> `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md`.

---

## Product pillars

1. **Performant** — smooth drag-and-drop and scrolling with thousands of cards.
2. **Offline-first** — full functionality with no network; the local store is authoritative.
3. **Syncable** — changes reconcile across a user's devices via CRDTs, no manual conflict handling.
4. **Keyboard-first & agent-native** — everything is reachable by keyboard, and every mutation runs
   through the shared command layer so an agent (REST/MCP) can do anything the UI can.

## Platforms

- **Desktop** — Tauri (native window, tray, notifications, local SQLite).
- **Web** — the same React app shipped as a responsive SPA.
- **No mobile app yet.**

---

## Tech stack (locked)

| Layer             | Choice                             | Notes                                                                                              |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Language          | TypeScript                         |                                                                                                    |
| UI framework      | **Next.js 16.2.6** (React 19)      | App Router; **`output: 'export'` (static)** so the same build runs in the browser and inside Tauri |
| Desktop shell     | **Tauri** (Rust)                   | Bundles the Next.js static export; small binary, low memory, fast; no exotic native APIs needed    |
| Sync              | **Yjs** (CRDT) over Hocuspocus     | Local-first; self-hosted `/sync` WebSocket relay                                                   |
| Local persistence | IndexedDB (web) / SQLite (desktop) | Offline-first                                                                                      |
| Backend           | Node (Hono) sync server + Postgres | Durable Yjs snapshots + auth + REST/MCP command API + link-metadata endpoint                       |
| Build/monorepo    | pnpm workspaces + Turborepo        |                                                                                                    |

> **Next.js + Tauri constraint:** Tauri bundles static assets, so the app builds with
> `output: 'export'` — a fully client-side app. No runtime SSR, API routes, or server actions in the
> _desktop_ build; guard `window`/`localStorage`/IndexedDB to the client. Our backend is the separate
> sync server. On the web deploy we could opt into server features, but we keep the app
> static-export-compatible so one build serves both targets.

### Monorepo layout

```
boardly/
  packages/
    domain/      # Framework-agnostic TS: types, status enum, ordering, link registry — shared everywhere
    sync/        # Yjs schema + typed accessors (board-doc); provider/persistence (client); useY (react)
    commands/    # The command layer — every mutation as a validated command (UI + REST + MCP share it)
    ui/          # Shared React components (shadcn/ui restyled to the design tokens)
  apps/
    web/         # Next.js 16.2.6 app — the product. Web deploy AND `output: 'export'` for desktop
    desktop/     # Tauri (Rust) shell — bundles apps/web's static export; native URL-metadata fetch
    server/      # Node/Hono sync server + Postgres snapshots + auth + REST command API + link metadata
    mcp/         # MCP server exposing the command catalog as agent tools
    e2e/         # Playwright end-to-end + a11y specs
```

---

## Architecture

### One space per user (collapsed board layer)

A user has exactly **one Yjs content doc**, addressed by the user's id: the sync room is
`board:{userId}` (server document name `board:{userId}`; local room `boardly:board:{userId}`). There
is **no** board id chosen by the client, **no** workspace index doc listing boards, **no** `boards`
Postgres table, and **no** `POST /boards` registration route. The internal code keeps its
`board`/`board-doc` names (the doc is simply "the user's board"), and `Board.id` is the user's id.

- **Authorized purely by identity.** The `board:{userId}` sync room authorizes iff the requesting
  user owns it — the parsed room id must equal the authenticated user's id
  (`apps/server/src/sync/authz.ts`). No ownership-table lookup. `POST /sync/ticket` performs the same
  identity check before issuing a one-time ticket, so the ticket and the sync handshake agree.
- **Per-account local isolation.** The local IndexedDB doc is keyed by the authenticated user id
  (`apps/web/lib/boardly-context.tsx` builds the command context from `useAuthSession().userId`), so
  signing into a different account uses a different local doc — no cross-account leakage.
- **No `boardId` on the command surface.** Commands operate on the caller's single doc; the context
  resolves it from the authenticated user (`packages/commands/src/context.ts`).
- **Reset, not migrated.** The board-layer collapse and the column→status collapse were a reset:
  existing `board:{id}` docs, `boards` rows, and the old workspace index were abandoned; users start
  fresh and the demo is re-seeded (`packages/sync/scripts/seed-demo-board.ts`).

### Sync & persistence

- Yjs is the CRDT; the browser persists locally to IndexedDB and syncs the doc to the server over the
  `/sync` WebSocket (Hocuspocus), which snapshots to Postgres. Offline edits reconcile automatically
  on reconnect — no manual conflict handling.
- The Yjs schema and all typed accessors live in `packages/sync/src/board-doc.ts` /
  `schema.ts`; every mutation the UI performs goes through `packages/commands` (never mutating Yjs
  types directly from components), which is what keeps the UI and the agent (REST/MCP) surfaces in
  lockstep.

### Command layer (agent-native)

Every action a user can take is a command in `packages/commands` with zod-validated input. The web
app, the REST endpoint (`apps/server/src/routes/commands.ts`), and the MCP tools (`apps/mcp`) all
execute the same catalog against the authenticated user's doc, so anything the UI can do an agent can
do too.

---

## Feature set

### The board

- **One space per user** — no create/switch/delete of boards; the user opens straight into their space.
- **Fixed status columns.** The board renders exactly **eight** fixed Linear workflow statuses, in
  order: **Backlog · Todo · In Progress · Pending · In Review · Done · Canceled · Duplicate**. Columns
  **cannot** be added, renamed, reordered, or WIP-limited — the column set is derived from the status
  enum (`packages/domain/src/status.ts`), so it can never drift.
- **A card's column IS its status.** There is a single placement axis: `status`. **Dragging** a card
  to a column applies that status immediately (`moveCard({ cardId, toStatus, afterId, beforeId })`,
  which writes `status` + a between-neighbors fractional `ord` in one action). The card-drawer status
  picker uses `setCardStatus` (status only, keeps position).
- **Show/hide empty columns.** A synced board-meta flag `showEmptyColumns` (default `true`), toggled
  from a board-toolbar control, hides or shows the columns that currently have no cards. Because it's
  stored in board meta it persists per-user and syncs across devices.
- **Cards** — title + markdown description; drag-and-drop to reorder within / re-status across
  columns. Archive instead of delete.
- **Projects** — the in-app grouping that multiple boards used to provide. A card belongs to at most
  one project; a sidebar project list scopes the board to one project (or "All"). Projects are
  created, renamed, recolored, archived, and can be created at card-create time
  (see `docs/units/UNIT-6.6-*` / `UNIT-6.7-*`).

### Cards & card details

- Checklists / sub-tasks, due dates, colored labels/tags, priority (Urgent/High/Medium/Low/None),
  assignee, activity/history log per card.
- **Integer ticket numbers with a display-only prefix.** Each card gets a monotonic integer number.
  A **board-level** display prefix controls how ids render: empty → `#42`, or e.g. `BRD` → `BRD-42`.
  The prefix is display-only (it doesn't change the underlying number).
- **Linear-style ticket URLs.** Opening a ticket writes a hash URL (e.g. `#BRD-142`) that deep-links
  back to that card and resolves on load (`docs/units/UNIT-6.3-*`).
- **Card-face link cluster.** Pasted URLs become provider-aware chips; the card _face_ shows a
  compact cluster of provider icons with a `+N` overflow, and the card drawer lists the links with
  **drag-to-reorder** (`docs/units/UNIT-6.4-*`, `UNIT-6.5-*`).
- **Description image attachments.** Paste or drag an image into the markdown description; it uploads
  to the server, renders inline, and persists. Bytes live on disk (a Docker volume in prod), metadata
  in Postgres — never in the Yjs doc; serving is auth-gated per owner (`docs/units/UNIT-12.1-*` …
  `UNIT-12.6-*`).

### Highlighted fields (card-face badges)

Each card renders a compact **badge row** on its face — the high-signal fields, in shortened form, so
the board is scannable without opening cards. Which fields show (and their order) is **configurable
per board** via the badge config (Settings → card display).

**1. Structured fields** (typed, first-class): status, priority, deadline (relative
`Jul 12` / `2d`, amber near due, red overdue), labels, assignee, checklist meter.

**2. Smart link fields** (URL → provider-aware chip): the link registry detects ~45 providers
(issue trackers, docs/design/media, work tools, general web/social) and renders a **bundled brand
SVG** per provider — none fetched over the network. Generic URLs fall back to a favicon + title chip
(favicon via native fetch on desktop, the server link-metadata endpoint on web).

### Linear-inspired

- Command palette (⌘K) for every action; keyboard-first navigation (no mouse required).
- Instant fuzzy search across the space.
- Saved filters / views ("My urgent work", "Due this week") over one shared view model, rendered as
  either a **board** or a **list** lens (`docs/units/UNIT-V1.1-*` … `UNIT-V1.4-*`).
- Focus mode / zen mode (`docs/units/UNIT-F1-*`, `UNIT-F2-*`).
- Swimlanes / grouping (by assignee, label, priority, status) — a read/triage view.

### Navigation, settings & keyboard

- **Sidebar** (top→bottom): logo → Search → projects list → **Settings** → account/theme footer.
  Settings is the **last full-width nav item**, directly above the account/profile button (it moved
  out of the old footer icon slot). It opens a full-pane settings view routed by the `#settings` hash.
- **Settings view** — the board-level ticket prefix, card-face badge/display config, project
  management (`docs/units/UNIT-6.8-*`), and a **Storage** section showing database + uploaded-files
  usage against configured caps (`docs/units/UNIT-12.6-*`).
- **ESC escape ladder.** ESC is a guarded ladder that yields to whoever already owns ESC — open
  Radix dialogs/sheets/command-palette, inline text edits, and active dnd-kit drags. When nothing
  else owns it: if the Settings pane is open → close it (back to the board); else reset the project
  scope to the **All-projects** view (`docs/units/UNIT-7.10-*`).

### Data & sync

- Conflict-free single-user multi-device sync (Yjs/Hocuspocus + Postgres snapshots).
- Import / export (JSON snapshot round-trip). _Known gap: import/export does not yet carry projects
  (pre-existing, `docs/units/UNIT-6.6-*`)._

### Later

- Multi-user real-time collaboration; a future workspace/grouping layer for v2 multi-workspace
  (deliberately out of scope now — the content schema is untouched, so a later addressing layer stays
  feasible).
- Roadmap / timeline view, plugin system, insights/charts (velocity, cycle time).
- Cross-lane / swimlane drag reordering (swimlanes are read/triage-only today).

---

## Reference: Focalboard — **learn, do not copy**

A clone lives at `../demo-app/focalboard/` for study only.

- **License blocker:** Focalboard source is **AGPL v3.0** (MIT covers only Mattermost's own compiled
  binaries). AGPL's network-use copyleft would force open-sourcing all of Boardly because of the web
  version. We will not lift its source.
- **Stack mismatch:** Go server, native desktop wrappers, Redux + server-authoritative sync, React 17
  — the opposite of our architecture.
- **What we borrow (ideas only):** data model shape, typed property/custom-field system, view types
  (board/list), CSV/Markdown import-export.

---

## Roadmap

- **Phase 0 — Scaffold** the pnpm monorepo (empty, wired configs). ✅
- **Phase 1 — Local-first core** (offline, no sync): Yjs model, board UI + drag-and-drop, card
  editor, local persistence. ✅
- **Phase 2 — Signature features**: highlighted card-face badges (status/priority/deadline + smart
  link chips), labels/priority/due/checklists/assignee, command palette + keyboard nav, short ids. ✅
- **Phase 3 — Sync**: Hocuspocus + Postgres snapshots + auth; multi-device reconciliation; REST/MCP
  command API. ✅
- **Phase 4 — Depth**: saved views/filters, swimlanes, activity log, import/export, focus mode. ✅
- **Phase 5 — Product pivots** (shipped):
  - Integer ticket ids + display-only board prefix + Linear-style ticket URLs.
  - Projects as the in-app grouping; project scoping; settings view.
  - **Collapse the board layer** into one per-user space (`board:{userId}`, identity authz, boards
    table/route removed, per-account local isolation).
  - **Fixed Linear status columns** (eight, no add/rename/reorder/WIP); drag applies status; synced
    show/hide-empty toggle.
  - Settings as the last sidebar nav item; ESC escape ladder.
- **Phase 6 — Polish & ship**: themes (light pass), Tauri auto-update, packaging, web deploy.

---

## Working rules

Binding rules for humans and agents live in `CLAUDE.md` (docs discipline, design system, engineering
standards, exact-version deps, git). The design system is `docs/design/DESIGN.md`; per-unit change
docs are in `docs/units/` (convention in `docs/units/README.md`).
