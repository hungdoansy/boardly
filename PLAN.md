# Boardly — Project Plan

A performant, offline-first kanban board app for **desktop + responsive web**, inspired by
the Obsidian kanban plugin, with **Linear-style UX**. Local data is the source of truth;
changes sync across devices when online.

---

## Product pillars

1. **Performant** — smooth drag-and-drop and scrolling with thousands of cards.
2. **Offline-first** — full functionality with no network; the local store is authoritative.
3. **Syncable** — changes reconcile across desktop ↔ web via CRDTs, no manual conflict handling.

## Platforms

- **Desktop** — Tauri (native window, tray, notifications, local SQLite).
- **Web** — the same React app shipped as a responsive SPA.
- **No mobile app yet.**

---

## Tech stack (locked)

| Layer             | Choice                               | Notes                                                                                              |
| ----------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Language          | TypeScript                           |                                                                                                    |
| UI framework      | **Next.js 16.2.6** (React 19)        | App Router; **`output: 'export'` (static)** so the same build runs in the browser and inside Tauri |
| Desktop shell     | **Tauri** (Rust)                     | Bundles the Next.js static export; small binary, low memory, fast; no exotic native APIs needed    |
| Sync              | **Yjs** (CRDT), self-hosted          | Local-first; `y-websocket` relay                                                                   |
| Local persistence | IndexedDB (web) / SQLite (desktop)   | Offline-first                                                                                      |
| Backend           | Node `y-websocket` server + Postgres | Durable snapshots + auth + link-metadata endpoint                                                  |
| Build/monorepo    | pnpm workspaces + Turborepo          |                                                                                                    |

> **Next.js + Tauri constraint:** Tauri bundles static assets, so the app builds with
> `output: 'export'` — a fully client-side app. No runtime SSR, API routes, or server actions
> in the _desktop_ build. This is fine: our backend is the separate Yjs sync server. On the web
> deploy we could opt into server features, but we keep the app static-export-compatible so one
> build serves both targets. See the link-metadata note under Core features for how this affects
> URL enrichment.

### Monorepo layout

```
boardly/
  packages/
    domain/      # Framework-agnostic TS: types, board/card logic, ordering — shared by app + server
    sync/        # Yjs schema, providers, local persistence adapters (IndexedDB / SQLite)
    ui/          # Shared React components (consumed by the Next.js app via transpilePackages)
  apps/
    web/         # Next.js 16.2.6 app — the product. Web deploy AND `output: 'export'` for desktop
    desktop/     # Tauri (Rust) shell — bundles apps/web's static export; native URL-metadata fetch
    server/      # Node y-websocket sync server + Postgres + link-metadata endpoint
  package.json   # pnpm workspaces + turbo.json
```

---

## Feature set

### Core (MVP)

- Boards: create / rename / delete
- Columns: add / rename / reorder / delete
- Cards: title + markdown description; drag-and-drop within/across columns; reorder columns
- Local persistence, fully offline
- **Link attachments** — paste a URL → auto-fetch title + favicon, rendered as a rich chip.
  Metadata fetch: **desktop** does it natively in Rust (no CORS, no server needed); **web** routes
  through the Node server's link-metadata endpoint.
- **Highlighted card fields** — a compact badge row on the card _face_ (shortened form) surfacing
  the fields that matter at a glance. See "Highlighted fields" below.

### Card details

- Checklists / sub-tasks
- Due dates
- Labels / tags (colored)
- File attachments
- Priority levels (Urgent / High / Medium / Low)
- Assignee
- Archive instead of delete

### Highlighted fields (card-face badges)

Each card renders a compact **badge row** on its face — the high-signal fields, in shortened
form, so a board is scannable without opening cards. Same badges appear expanded in the card
detail view. Which fields show (and their order) is **configurable per board**.

Two kinds of highlighted field:

**1. Structured fields** (typed, first-class)

| Field    | Card-face form           | Behavior                               |
| -------- | ------------------------ | -------------------------------------- |
| Severity | `S1`–`S4` or colored dot | Sortable/filterable; color-coded       |
| Deadline | `Jul 12` / `2d` relative | Turns amber near due, red when overdue |

**2. Smart link fields** (URL → provider-aware chip with icon + shortened label)

| Provider       | Detected from                  | Chip renders                                        |
| -------------- | ------------------------------ | --------------------------------------------------- |
| Slack message  | `*.slack.com/archives/...`     | Slack icon + `#channel` or `msg →`                  |
| Linear ticket  | `linear.app/.../issue/ABC-123` | Linear icon + `ABC-123`                             |
| Claude session | `claude.ai/code/session_...`   | Claude icon + `session →`                           |
| Generic URL    | any other link                 | Favicon + site title (the Link-attachment behavior) |

- Provider detection is a small set of URL matchers with per-provider icon + label formatter;
  falls back to the generic favicon+title chip. Easy to extend with new providers later.
- Icons for known providers are **bundled** (no per-render network call). Generic favicons use
  the metadata fetch (native on desktop, server endpoint on web).
- Clicking a chip opens the link (external browser on desktop, new tab on web).

### Linear-inspired

- Command palette (Cmd+K) for every action
- Keyboard-first navigation (no mouse required)
- Short card IDs (e.g. `BRD-142`)
- Sub-issues / card relations (blocks, relates to, parent-child)
- Saved filters / views ("My cards", "Due this week")
- Quick-add with natural-language parsing (due date, tags)
- Activity / history log per card
- Instant fuzzy search across all boards

### Board-level

- Swimlanes / grouping (by assignee, label, priority)
- WIP limits per column
- Board templates

### Data & sync

- Import / export (Markdown, JSON, Trello / Obsidian-kanban interop)
- Conflict-free multi-device sync

### Later

- Multi-user real-time collaboration
- Roadmap / timeline view
- Plugin system
- Insights / charts (velocity, cycle time)

---

## Reference: Focalboard — **learn, do not copy**

A clone lives at `../demo-app/focalboard/` for study only.

- **License blocker:** Focalboard source is **AGPL v3.0** (MIT covers only Mattermost's own
  compiled binaries). AGPL's network-use copyleft would force open-sourcing all of Boardly
  because of the web version. We will not lift its source.
- **Stack mismatch:** Go server, native desktop wrappers, Redux + server-authoritative sync,
  React 17 — the opposite of our architecture.
- **What we borrow (ideas only):** data model shape (boards → cards → blocks), the typed
  property/custom-field system, view types (board/table/gallery), CSV/Markdown import-export.

---

## Roadmap

- **Phase 0 — Scaffold** the pnpm monorepo (empty, wired configs).
- **Phase 1 — Local-first core** (offline, no sync): Yjs model (Board → Columns → Cards,
  fractional-index ordering), board UI + drag-and-drop, card editor, local persistence.
- **Phase 2 — Signature features**: highlighted card-face badges (severity, deadline, and
  smart link chips for Slack / Linear / Claude session / generic URL), labels/priority/due/
  checklists/assignee, command palette + keyboard nav, short card IDs.
- **Phase 3 — Sync**: `y-websocket` + Postgres snapshots + auth; web ↔ desktop reconciliation.
- **Phase 4 — Depth**: saved views/filters, swimlanes, relations, activity log, import/export.
- **Phase 5 — Polish & ship**: themes, Tauri auto-update, packaging, web deploy.

**Next step:** read Focalboard's data model / property system to lock the Yjs schema, then
scaffold Phase 0.
