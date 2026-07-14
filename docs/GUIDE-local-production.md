# Running Boardly locally (production, solo)

This is the runbook for using Boardly as a real app on **one Mac**, just for you. There are two
pieces:

1. **The backend** — Postgres + the sync/API server — runs in **Docker**. Start it once; it comes
   back automatically on every reboot.
2. **The desktop app** — a native macOS **Boardly.app** (built with Tauri) — installed like any
   other app. It talks to the backend on your machine.

Your data lives only on this laptop (in Docker's Postgres volume). Nothing leaves the machine.

```
┌────────────────────────┐        http://localhost:8788        ┌───────────────────────────────┐
│  Boardly.app (desktop) │ ───────────────────────────────────▶ │  boardly-prod-server (Docker) │
│  Tauri + web bundle    │ ◀───── ws://localhost:8788/sync ───── │  Fastify + Hocuspocus         │
└────────────────────────┘                                       └────────────┬──────────────────┘
                                                                               │
                                                                  ┌────────────▼──────────────────┐
                                                                  │  boardly-prod-db (Docker, PG) │
                                                                  │  snapshots + auth             │
                                                                  └───────────────────────────────┘
```

> **Production and dev are fully separate.** The production stack above
> (`docker-compose.prod.yml`) has its **own** containers, database, volume, and network, and listens
> on host port **8788**. Local development uses a **different** stack: the dev database
> (`docker-compose.yml`, port 5433) plus a host-run server on **8787**. So you can *use* the
> production app and *develop* Boardly at the same time — neither touches the other's data. This
> guide is about the production stack; the dev workflow is summarized in
> ["Developing while using the app"](#developing-while-using-the-app) at the end.

---

## Prerequisites

- **Docker Desktop** — running. That's all you need to *use* the app once it's built.
- To **rebuild** the desktop app or the backend image you also need (already set up on this machine):
  - Node **24.15.0** + pnpm **11.1.3** (matches `.nvmrc` — this is the machine's default node, no
    `PATH` export needed).
  - Rust (`cargo`) — for the Tauri build.

---

## 1. Start the backend (one command)

The production stack lives in `docker-compose.prod.yml`. Every command below is a normal
`docker compose` call with `-f docker-compose.prod.yml` (that file pins its own project name, so
containers/volumes stay isolated from dev). From the repo root:

```bash
cp .env.example .env      # first time only — defaults are fine
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the server image (first time only, ~1 min) and starts two containers:

- `boardly-prod-db` — Postgres (its own volume `boardly-prod_pgdata`; pinned to **postgres:16**).
- `boardly-prod-server` — the sync/API server on **http://localhost:8788**. It runs its DB
  migrations automatically on start.

Both have `restart: unless-stopped`, so after a reboot they start again on their own once Docker
Desktop is up. You never need to run the server by hand.

**Verify it's healthy:**

```bash
docker compose -f docker-compose.prod.yml ps        # both services "Up"; db "(healthy)"
curl http://localhost:8788/health                   # → {"status":"ok","db":"up"}
```

Useful day-to-day commands (all take `-f docker-compose.prod.yml`):

```bash
docker compose -f docker-compose.prod.yml logs -f server   # follow server logs
docker compose -f docker-compose.prod.yml stop             # pause the backend
docker compose -f docker-compose.prod.yml up -d            # resume
docker compose -f docker-compose.prod.yml down             # stop & remove containers (data KEPT)
```

> **Tip.** If typing `-f docker-compose.prod.yml` gets old, alias it:
> `alias bprod='docker compose -f docker-compose.prod.yml'` → then `bprod up -d`, `bprod logs -f server`, etc.

---

## 2. Install the desktop app

The build produces a native app + installer at:

```
apps/desktop/src-tauri/target/release/bundle/
  macos/Boardly.app                       ← the app
  dmg/Boardly_1.0.0_aarch64.dmg           ← drag-to-install disk image
```

Install it:

1. Open `Boardly_1.0.0_aarch64.dmg`.
2. Drag **Boardly** into **Applications**.

**First launch — Gatekeeper.** This is an unsigned local build, so double-clicking may say *"Boardly
can't be opened because Apple cannot check it for malicious software."* That's expected. Open it
once via **right-click (or Control-click) → Open → Open**. macOS remembers the choice after that.
(Equivalent from a terminal: `xattr -dr com.apple.quarantine /Applications/Boardly.app`.)

> The backend (step 1) must be running for the app to sign in or sync. If Docker isn't up, the app
> loads but can't reach the server.

### Rebuilding the app

After pulling code changes, rebuild:

```bash
pnpm --filter @boardly/desktop tauri:build
```

`apps/web/.env.production` bakes `NEXT_PUBLIC_API_URL=http://localhost:8788` into the web bundle for
every production build automatically (Next.js auto-loads it for `next build`, never for `next dev`) —
so the app reaches the Docker backend without any manual export. If you ever need a different backend
URL for a one-off build, override it inline: `NEXT_PUBLIC_API_URL=http://... pnpm --filter
@boardly/desktop tauri:build`. Then reinstall from the new `.dmg` (or copy the fresh `Boardly.app`
over the old one in `/Applications`).

---

## 3. First run

1. Make sure the backend is up (`docker compose -f docker-compose.prod.yml ps`).
2. Launch **Boardly**.
3. **Create an account** (email + password) — this is stored only in your local Postgres. Sign in.
4. Create a project and a card. Add a due date, labels, a checklist, paste a link.
5. **Quit and relaunch.** Your board is still there — that confirms the app ↔ server ↔ Postgres
   round-trip is working (your edits were snapshotted to the database).

---

## 4. (Optional) Load the demo board

Want a fully populated example board instead of a blank slate? Seed the demo account. With the
backend running, from the repo root:

```bash
API_URL=http://localhost:8788 \
  apps/server/node_modules/.bin/tsx packages/sync/scripts/seed-demo-board.ts
```

This creates (or reuses) **demo@boardly.app** / **demo-boardly-2026** and fills it with cards across
every status, priorities, due dates, labels, links, checklists, projects, and saved views. Sign into
the app with those credentials to see it.

- Re-running is idempotent (won't duplicate).
- `SEED_RESET=1 API_URL=… tsx …` wipes and rebuilds the demo board with the latest fixtures.

---

## 5. Reset / uninstall

- **Wipe production data and start fresh** (destroys every production account and board — does NOT
  touch your dev database):
  ```bash
  docker compose -f docker-compose.prod.yml down -v      # -v removes boardly-prod_pgdata
  docker compose -f docker-compose.prod.yml up -d --build
  ```
- **Uninstall the app**: drag `/Applications/Boardly.app` to the Trash.
- **Remove the backend entirely**: `docker compose -f docker-compose.prod.yml down -v` then delete
  the images if you like (`docker image rm boardly-prod-server postgres:16`).

---

## Checking logs

**Server (Docker):**
```bash
docker compose -f docker-compose.prod.yml logs -f server   # follow live
docker compose -f docker-compose.prod.yml logs --tail 100 server
```
The server logs boot lines, migrations, and errors (per-request logging is off by design). To
sanity-check the API directly:
```bash
curl -s localhost:8788/health                              # {"status":"ok","db":"up"}
# reproduce a login exactly as the desktop app does (its origin is tauri://localhost):
curl -s -X POST localhost:8788/auth/login -H "Origin: tauri://localhost" \
  -H "content-type: application/json" -d '{"email":"you@example.com","password":"…"}'
```

**Desktop app (webview console):** the production build has no devtools. To see the app's own
console/network errors, run it in **dev mode** (which has right-click → Inspect) pointed at the
production backend:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8788 pnpm --filter @boardly/desktop dev
```
Then right-click in the window → **Inspect Element** → **Console** / **Network** tabs.

---

## Troubleshooting

**`curl localhost:8788/health` fails / app can't reach the server**
- Is Docker Desktop running? Is the stack up? `docker compose -f docker-compose.prod.yml ps`.
- Check logs: `docker compose -f docker-compose.prod.yml logs server`.

**Log in bounces straight back to the login screen (desktop)**
- Fixed: the server now returns the refresh token in the login/refresh body for the desktop origin
  (`tauri://localhost`) so it can live in the OS keychain — previously it was cookie-only and the
  cookie couldn't reach the Tauri webview, so every post-login session check logged you out. Make
  sure your production server is rebuilt (`docker compose -f docker-compose.prod.yml up -d --build`).

**`boardly-prod-db` is "unhealthy" / restarting after an image change**
- A newer Postgres major can't open a data dir created by an older one. Keep `POSTGRES_IMAGE` in
  `.env` matching the volume (`postgres:16`). To move majors you must dump & restore, or wipe with
  `docker compose -f docker-compose.prod.yml down -v` (loses production data).

**Port already in use (8788)**
- Something else is on the port. Change it in `.env`: `BOARDLY_SERVER_PORT=…`. If you change the
  server port, rebuild the app with the matching `NEXT_PUBLIC_API_URL`.

**Login works but sync/refresh silently fails (CORS)**
- The server only accepts browser-credentialed calls from allow-listed origins. The desktop app's
  webview origin is included by default (`tauri://localhost`). If a future macOS/Tauri version uses
  a different origin, find it in the logs — `docker compose -f docker-compose.prod.yml logs server`
  — and add it to `CORS_ORIGINS` in `.env`, then `docker compose -f docker-compose.prod.yml up -d`.

**"Apple cannot check it for malicious software"**
- Expected for an unsigned local build. Right-click → Open once (see step 2).

---

## Developing while using the app

The production stack (above) and local development are deliberately separate — different containers,
different database/volume, different ports — so running one never disturbs the other.

| | Production (use the app) | Local dev (work on the code) |
|---|---|---|
| Compose file | `docker-compose.prod.yml` | `docker-compose.yml` |
| Containers | `boardly-prod-db`, `boardly-prod-server` | `boardly-dev-db` only |
| Database volume | `boardly-prod_pgdata` | `boardly_boardly_pgdata` |
| Server | in Docker, port **8788** | on the host, port **8787** (hot reload) |
| Postgres host port | none (internal only) | **5433** |
| Frontend | the installed `Boardly.app` | `next dev` (:3000) or `tauri dev` |

Typical dev session (leaves production running and untouched):

```bash
docker compose up -d                         # start the dev database (boardly-dev-db)
pnpm --filter @boardly/server dev            # dev API server on :8787 (watches, reloads, reads .env)
pnpm --filter @boardly/web dev               # dev web app on :3000  (or: pnpm --filter @boardly/desktop dev)
```

Your production board (in `Boardly.app`) keeps working the whole time — it's on 8788 against a
different database.
