# Boardly

A performant, offline-first kanban app for **desktop and responsive web**, inspired by the Obsidian
kanban plugin with **Linear-style UX**. Your local data is the source of truth; changes sync across
your own devices when online — no manual conflict handling, no accounts to share, no cloud you don't
control.

Boardly is **single-user and self-hosted**: each user owns exactly **one space** (one board). There
is no board list, no board switching, and no multi-user collaboration. In-app grouping is done with
**projects**, and the columns are the **fixed Linear workflow statuses**.

> **Status:** feature-complete through Phase 5 (see [Roadmap](#roadmap)). The canonical description
> of _what Boardly is right now_ lives in [`PLAN.md`](PLAN.md).

---

## Table of contents

- [Why Boardly](#why-boardly)
- [Product pillars](#product-pillars)
- [Feature tour](#feature-tour)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Monorepo layout](#monorepo-layout)
- [Getting started (development)](#getting-started-development)
- [Running the backend](#running-the-backend)
- [Environment variables](#environment-variables)
- [Common commands](#common-commands)
- [The command layer & agent surfaces](#the-command-layer--agent-surfaces)
- [HTTP API](#http-api)
- [Building the desktop app](#building-the-desktop-app)
- [Local production (single Mac)](#local-production-single-mac)
- [Testing](#testing)
- [Project conventions](#project-conventions)
- [Documentation map](#documentation-map)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why Boardly

Most kanban tools are either cloud-locked SaaS or heavyweight, slow, and collaboration-first. Boardly
takes the opposite bet:

- **Your data lives on your machine.** IndexedDB in the browser, SQLite/IndexedDB on desktop. The
  self-hosted server only holds durable snapshots and handles auth — nothing leaves your control.
- **It's fast and keyboard-first**, modeled on Linear: dense, calm, dark-mode-first, command-palette
  driven.
- **It's agent-native.** Every mutation the UI performs runs through a shared command layer, which is
  also exposed over REST and MCP — so an AI agent can do anything you can do in the app.

---

## Product pillars

1. **Performant** — smooth drag-and-drop and scrolling with thousands of cards.
2. **Offline-first** — full functionality with no network; the local store is authoritative.
3. **Syncable** — changes reconcile across your devices via CRDTs, with no manual conflict handling.
4. **Keyboard-first & agent-native** — everything is reachable by keyboard, and every mutation runs
   through the shared command layer so an agent (REST/MCP) can do anything the UI can.

---

## Feature tour

### The board

- **One space per user** — no create/switch/delete of boards; you open straight into your space.
- **Fixed status columns.** The board renders exactly **eight** fixed Linear workflow statuses, in
  order: **Backlog · Todo · In Progress · Pending · In Review · Done · Canceled · Duplicate**.
  Columns can't be added, renamed, reordered, or WIP-limited — the set is derived from the status
  enum, so it can never drift.
- **A card's column _is_ its status.** Dragging a card to a column applies that status immediately
  (writing both `status` and a fractional between-neighbors `ord` in one action).
- **Show/hide empty columns** — a synced per-user toggle that persists across devices.

### Cards & details

- Title + markdown description, drag-and-drop reorder within / re-status across columns.
- Checklists / sub-tasks, due dates, colored labels/tags, priority (Urgent/High/Medium/Low/None),
  assignee, and a per-card activity/history log.
- **Archive instead of delete** (hard delete is available, guarded by confirmation).
- **Integer ticket numbers with a display-only prefix.** Each card gets a monotonic integer; a
  board-level prefix controls rendering — empty → `#42`, or e.g. `BRD` → `BRD-42`.
- **Linear-style ticket URLs.** Opening a ticket writes a hash URL (e.g. `#BRD-142`) that deep-links
  back to the card and resolves on load.

### Highlighted card-face badges

Each card renders a compact, configurable **badge row** so the board is scannable without opening
cards:

- **Structured fields** — status, priority, relative deadline (`Jul 12` / `2d`, amber near due, red
  overdue), labels, assignee, checklist meter.
- **Smart link chips** — pasted URLs become provider-aware chips. The link registry detects ~45
  providers (issue trackers, docs/design/media, work tools) and renders a **bundled brand SVG** per
  provider — none fetched over the network. Generic URLs fall back to a favicon + title chip.

### Projects & navigation

- **Projects** are the in-app grouping that multiple boards used to provide. A card belongs to at
  most one project; the sidebar project list scopes the board to one project (or "All"). Projects can
  be created, renamed, recolored, archived, and created at card-create time.
- **Sidebar** (top→bottom): logo → Search → projects list → **Settings** → account/theme footer.
- **Settings view** — the board-level ticket prefix, card-face badge/display config, and project
  management.
- **ESC escape ladder** — a guarded ladder that yields to whoever owns ESC (dialogs, inline edits,
  active drags), then closes Settings, then resets the project scope to "All".

### Linear-inspired power features

- Command palette (⌘K) for every action; full keyboard navigation.
- Instant fuzzy search across the space.
- Saved filters / views over one shared view model, rendered as a **board** or a **list** lens.
- Focus / zen mode.
- Swimlanes / grouping (by assignee, label, priority, status) as a read/triage view.

### Data & sync

- Conflict-free single-user multi-device sync (Yjs/Hocuspocus + Postgres snapshots).
- Import / export via JSON snapshot round-trip. _Known gap: import/export does not yet carry
  projects._

---

## Architecture

### One space per user (collapsed board layer)

A user has exactly **one Yjs content doc**, addressed by the user's id: the sync room is
`board:{userId}` (server document `board:{userId}`, local room `boardly:board:{userId}`). There is
**no** client-chosen board id, **no** workspace index doc, **no** `boards` Postgres table, and **no**
`POST /boards` route.

- **Authorized purely by identity.** The `board:{userId}` room authorizes iff the requesting user
  owns it — the parsed room id must equal the authenticated user's id. No ownership-table lookup.
  `POST /sync/ticket` performs the same check before issuing a one-time ticket.
- **Per-account local isolation.** The local IndexedDB doc is keyed by the authenticated user id, so
  signing into a different account uses a different local doc — no cross-account leakage.
- **No `boardId` on the command surface.** Commands operate on the caller's single doc, resolved from
  the authenticated user.

### Sync & persistence

Yjs is the CRDT. The client persists locally (IndexedDB on web) and syncs the doc to the server over
the `/sync` WebSocket (Hocuspocus), which snapshots to Postgres. Offline edits reconcile
automatically on reconnect — no manual conflict handling. The Yjs schema and all typed accessors live
in `packages/sync`; every UI mutation goes through `packages/commands` (never mutating Yjs types
directly from components).

### Command layer (agent-native)

Every action a user can take is a command in `packages/commands` with zod-validated input. The web
app, the REST endpoint (`apps/server`), and the MCP tools (`apps/mcp`) all execute the **same
catalog** against the authenticated user's doc — so anything the UI can do, an agent can do too.

```
┌──────────┐   ┌──────────────┐   ┌────────────┐
│ Web UI   │   │ REST API     │   │ MCP tools  │
│ (React)  │   │ /api/commands│   │ (agents)   │
└────┬─────┘   └──────┬───────┘   └─────┬──────┘
     │                │                 │
     └────────────────┼─────────────────┘
                      ▼
        packages/commands  (zod-validated catalog)
                      ▼
        packages/sync  (Yjs board-doc + typed accessors)
                      ▼
     IndexedDB (local)  ⇄  Hocuspocus /sync  ⇄  Postgres snapshots
```

---

## Tech stack

| Layer             | Choice                              | Notes                                                                     |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------- |
| Language          | TypeScript (strict)                 | zod at every external/agent boundary                                      |
| UI framework      | **Next.js 16.2.6** (React 19)       | App Router, **`output: 'export'`** so one static build serves web + Tauri |
| Styling           | Tailwind CSS v4 + shadcn/ui (Radix) | Design tokens in `docs/design/DESIGN.md`; dark-mode first                 |
| Drag & drop       | dnd-kit                             | `@dnd-kit/core` + `sortable`                                              |
| Desktop shell     | **Tauri** (Rust)                    | Bundles the static export; native URL-metadata fetch, tray, notifications |
| Sync              | **Yjs** (CRDT) over Hocuspocus      | Local-first; self-hosted `/sync` WebSocket relay                          |
| Local persistence | IndexedDB (web) / SQLite (desktop)  | Offline-first                                                             |
| Backend           | **Fastify** + Hocuspocus + Postgres | Durable snapshots, auth (Argon2 + JWT), REST/MCP command API, unfurl      |
| Build / monorepo  | pnpm workspaces + Turborepo         | Exact-pinned deps; Node **24.15.0**, pnpm **11.1.3**                      |

> **Next.js + Tauri constraint:** Tauri bundles static assets, so the app builds with
> `output: 'export'` — a fully client-side app. No runtime SSR, API routes, or server actions in the
> desktop build; `window`/`localStorage`/IndexedDB are guarded to the client. The backend is the
> separate sync server.

---

## Monorepo layout

```
boardly/
  packages/
    domain/      # Framework-agnostic TS: types, status enum, ordering, link registry — shared everywhere
    sync/        # Yjs schema + typed accessors (board-doc); provider/persistence (client); useY (react)
    commands/    # The command layer — every mutation as a validated command (UI + REST + MCP share it)
    ui/          # Shared React components (shadcn/ui restyled to the design tokens)
  apps/
    web/         # Next.js 16.2.6 app — the product. Web deploy AND static export for desktop
    desktop/     # Tauri (Rust) shell — bundles apps/web's static export; native URL-metadata fetch
    server/      # Fastify sync server + Postgres snapshots + auth + REST command API + link metadata
    mcp/         # MCP server exposing the command catalog as agent tools
    e2e/         # Playwright end-to-end + a11y specs
  docs/          # PLAN, DESIGN, per-unit change docs, plans, deployment guide
```

---

## Getting started (development)

### Prerequisites

- **Node 24.15.0** (see `.nvmrc`) and **pnpm 11.1.3** (pinned in `packageManager`).
- **Docker Desktop** (for the dev Postgres container).
- For the desktop app only: a Rust toolchain + Tauri prerequisites.

```bash
nvm use                 # picks up .nvmrc (24.15.0)
pnpm install            # install the workspace
cp .env.example .env    # then adjust as needed
```

### Run the web app + backend (dev)

```bash
# 1. Start the dev Postgres container (port 5433)
docker compose up -d db

# 2. Apply migrations, then start the sync/API server (host, port 8787)
pnpm --filter @boardly/server db:migrate
pnpm --filter @boardly/server dev

# 3. Start the Next.js web app
pnpm --filter @boardly/web dev
```

The server auto-loads the root `.env` (via `tsx --env-file-if-exists=../../.env`) — no manual
`export` needed.

### Run the desktop app (dev)

```bash
pnpm --filter @boardly/desktop dev   # tauri dev — bundles the web build in a native window
```

---

## Running the backend

The backend is a single Fastify process that mounts:

- **Auth** routes (Argon2 password hashing, JWT access + refresh tokens).
- **Hocuspocus** `/sync` WebSocket relay with Postgres-backed snapshots.
- The **REST command API** (`/api/commands`).
- A **link-metadata (unfurl)** endpoint used by the web app for generic-URL chips.
- A `/health` liveness endpoint (checks the Postgres pool).

There are **two isolated stacks** so you can _use_ the app and _develop_ it at the same time:

| Stack          | Compose file              | Postgres           | Server            |
| -------------- | ------------------------- | ------------------ | ----------------- |
| **Dev**        | `docker-compose.yml`      | container, `:5433` | host, `:8787`     |
| **Production** | `docker-compose.prod.yml` | own volume         | container `:8788` |

Neither touches the other's data. See [Local production](#local-production-single-mac).

---

## Environment variables

Copy `.env.example` to `.env` (git-ignored). Key values:

| Variable                    | Default                                             | Purpose                                             |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `POSTGRES_IMAGE`            | `postgres:16`                                       | Pin to the major that initialized your data volume  |
| `POSTGRES_USER/PASSWORD/DB` | `boardly`                                           | Dev Postgres credentials                            |
| `POSTGRES_PORT`             | `5433`                                              | Host port for the dev container (avoids local 5432) |
| `DATABASE_URL`              | `postgres://boardly:boardly@localhost:5433/boardly` | Host-dev server → dev Postgres                      |
| `PORT` / `HOST`             | `8787` / `0.0.0.0`                                  | Dev server bind                                     |
| `NODE_ENV`                  | `development`                                       |                                                     |
| `BOARDLY_SERVER_PORT`       | `8788`                                              | Published port for the containerized prod server    |
| `CORS_ORIGINS`              | includes `tauri://localhost`                        | Credentialed origins allowed to call the API        |
| `ACCESS_TOKEN_TTL_SECONDS`  | `900`                                               | Access-token lifetime                               |
| `REFRESH_TOKEN_TTL_DAYS`    | `30`                                                | Refresh-token lifetime                              |
| `LOGIN_RATE_MAX`            | `5`                                                 | Login attempts per window (per IP)                  |
| `LOGIN_RATE_WINDOW_MS`      | `60000`                                             | Login rate window                                   |

For the desktop production build, the web bundle is baked with
`NEXT_PUBLIC_API_URL=http://localhost:8788` to match the containerized server.

---

## Common commands

All run from the repo root and fan out through Turborepo:

```bash
pnpm build           # turbo run build (all packages/apps)
pnpm typecheck       # turbo run typecheck
pnpm lint            # turbo run lint
pnpm test            # turbo run test (vitest)
pnpm format          # prettier --write .
pnpm format:check    # prettier --check .
```

Scope to one workspace with `--filter`, e.g. `pnpm --filter @boardly/web dev`.

> **Formatting note:** only run `prettier --write` on files you actually touched. A repo-wide
> `format` run reformats many untouched files.

---

## The command layer & agent surfaces

Every mutation is a named, zod-validated command in `packages/commands`. The current catalog:

**Cards** — `createCard`, `renameCard`, `setCardDescription`, `moveCard`, `setCardStatus`,
`setCardPriority`, `setCardDueDate`, `setCardProject`, `archiveCard`, `deleteCard`, `getCard`,
`searchCards`
**Checklists** — `addChecklistItem`, `toggleChecklistItem`, `setChecklistItemText`,
`moveChecklistItem`, `deleteChecklistItem`
**Labels** — `createLabel`, `renameLabel`, `recolorLabel`, `assignLabel`, `unassignLabel`,
`deleteLabel`
**Links** — `addLink`, `updateLinkTitle`, `moveLink`, `removeLink`
**Related cards** — `addRelatedCard`, `removeRelatedCard`
**Projects** — `createProject`, `renameProject`, `recolorProject`, `archiveProject`, `showProject`,
`listProjects`
**Board / settings** — `renameBoard`, `setTicketPrefix`, `setBadgeConfig`, `setShowEmptyColumns`,
`saveView`, `deleteView`, `importBoard`, `exportBoard`

The same catalog is exposed to agents two ways:

- **REST** — `GET /api/commands` (list) and `POST /api/commands/:name` (execute).
- **MCP** — `apps/mcp` wraps the catalog as Model Context Protocol tools so an AI assistant can drive
  the board.

---

## HTTP API

| Method & path              | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `POST /auth/signup`        | Create account, returns access + refresh tokens      |
| `POST /auth/refresh`       | Exchange a refresh token for a new access token      |
| `POST /auth/logout`        | Revoke the current refresh token                     |
| `GET  /api/commands`       | List the command catalog (names + input schemas)     |
| `POST /api/commands/:name` | Execute a command against the caller's board doc     |
| `POST /sync/ticket`        | Issue a one-time ticket for the `/sync` WebSocket    |
| `GET  /sync` (WebSocket)   | Hocuspocus Yjs sync relay (`board:{userId}` room)    |
| `GET  /api/unfurl`         | Fetch link metadata (title/favicon) for generic URLs |
| `GET  /health`             | Liveness probe (verifies the Postgres pool)          |

Auth uses Argon2 password hashing and JWT bearer access tokens; login is rate-limited per IP.

---

## Building the desktop app

```bash
# Production build (bakes NEXT_PUBLIC_API_URL from apps/web/.env.production)
pnpm --filter @boardly/desktop tauri:build
```

The build produces a native macOS `Boardly.app`. Because the app is currently **unsigned**, the
desktop refresh token is stored in a `0600` file (`<app-data-dir>/auth-store.json`) rather than the
OS keychain — an unsigned build otherwise re-prompts for Keychain access on every rebuild. When an
Apple Developer License is available, set a stable `signingIdentity` and switch back to the keychain
(see `CLAUDE.md` §7 and `docs/units/UNIT-P11-desktop-token-file-store.md`).

---

## Local production (single Mac)

The full runbook for running Boardly as a real, always-on app on one machine is in
[`docs/GUIDE-local-production.md`](docs/GUIDE-local-production.md). In short:

```bash
# Backend: Postgres + sync/API server in Docker (published on :8788)
docker compose -f docker-compose.prod.yml up -d

# Desktop: build once, install Boardly.app like any native app
pnpm --filter @boardly/desktop tauri:build
```

Your data lives only on this laptop, in Docker's Postgres volume. The production stack (`:8788`) and
the dev stack (`:8787`) are fully separate, so you can use the app and develop it simultaneously.

---

## Testing

- **Unit / integration** — Vitest across packages and the server (`pnpm test`, or
  `pnpm --filter <pkg> test`). Config in `vitest.config.ts` / `vitest.setup.ts`; IndexedDB is
  faked with `fake-indexeddb`, DOM via jsdom + Testing Library.
- **End-to-end + a11y** — Playwright in `apps/e2e` (`pnpm --filter @boardly/e2e e2e`). Run against an
  already-running dev server; snapshot updates via `e2e:update`.
- **Seeded demo account** — `demo@boardly.app` can be seeded with feature-complete fixtures via
  `packages/sync/scripts/seed-demo-board.ts` (`SEED_RESET=1` wipes and rebuilds).

The per-unit Definition of Done requires: tests + typecheck/lint/build green; e2e + a dark-mode
screenshot for user-facing flows; the unit doc committed; exact-version deps.

---

## Project conventions

These bind humans and agents alike. Read [`CLAUDE.md`](CLAUDE.md) first.

- **Docs discipline.** Every implementation unit gets a standalone doc in
  [`docs/units/`](docs/units/) named `UNIT-<id>-<slug>.md` covering _what changed / why / how it
  works / how to verify / follow-ups_. Any commit touching product source must stage a doc surface in
  the **same commit** (a `pre-commit` hook warns). Docs-first is encouraged.
- **Design.** The UI must look and feel like **Linear** — fast, dense, calm, keyboard-first,
  **dark-mode first**. Use shadcn/ui primitives and the tokens in
  [`docs/design/DESIGN.md`](docs/design/DESIGN.md); never hardcode ad-hoc colors/spacing/radii.
  **Icons are SVGs, never Unicode glyphs.** Motion is measured and respects `prefers-reduced-motion`.
- **Engineering.** Function components + hooks; derive, don't synchronize; scoped `useY`
  subscriptions with stable keys. All mutations go through `packages/commands`. TypeScript strict, no
  `any` without a written reason; validate external/agent input with zod.
- **Dependencies.** Every `package.json` pins **exact** versions (no `^`/`~`). Commit the lockfile.
- **Git.** Never `git push` or create a branch without explicit permission — committing locally per
  unit is always fine. Commit footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Documentation map

| Doc                                                                | Purpose                                     |
| ------------------------------------------------------------------ | ------------------------------------------- |
| [`PLAN.md`](PLAN.md)                                               | Source of truth for what Boardly is now     |
| [`CLAUDE.md`](CLAUDE.md)                                           | Binding working rules (humans + agents)     |
| [`AGENTS.md`](AGENTS.md)                                           | Quick agent summary (points to `CLAUDE.md`) |
| [`docs/design/DESIGN.md`](docs/design/DESIGN.md)                   | Binding design system + tokens              |
| [`docs/units/`](docs/units/)                                       | Per-unit change docs (~109 and counting)    |
| [`docs/plans/`](docs/plans/)                                       | Build & refactor plans                      |
| [`docs/GUIDE-local-production.md`](docs/GUIDE-local-production.md) | Single-Mac production runbook               |

---

## Roadmap

- **Phase 0 — Scaffold** the pnpm monorepo. ✅
- **Phase 1 — Local-first core** (Yjs model, board UI + DnD, card editor, local persistence). ✅
- **Phase 2 — Signature features** (card-face badges, labels/priority/due/checklists, command
  palette, short ids). ✅
- **Phase 3 — Sync** (Hocuspocus + Postgres snapshots + auth, multi-device reconciliation, REST/MCP
  command API). ✅
- **Phase 4 — Depth** (saved views/filters, swimlanes, activity log, import/export, focus mode). ✅
- **Phase 5 — Product pivots** (integer ticket ids + prefix + Linear-style URLs; projects as
  grouping; board-layer collapse to one per-user space; fixed Linear status columns; settings + ESC
  ladder). ✅
- **Phase 6 — Polish & ship** (light-mode pass, Tauri auto-update, packaging, web deploy).

**Later:** multi-user real-time collaboration; a v2 multi-workspace addressing layer; roadmap /
timeline view; plugin system; insights/charts; cross-lane swimlane drag.

---

## License

No license file is present in this repository. Boardly is a personal, self-hosted project; treat it
as all-rights-reserved unless a `LICENSE` is added.

> **Note on Focalboard:** a clone lives at `../demo-app/focalboard/` for _study only_. Its source is
> AGPL v3.0 and is **not** lifted into Boardly — only ideas (data-model shape, view types,
> import/export) are borrowed.
