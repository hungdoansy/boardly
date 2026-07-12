# Running Boardly locally (production, solo)

This is the runbook for using Boardly as a real app on **one Mac**, just for you. There are two
pieces:

1. **The backend** — Postgres + the sync/API server — runs in **Docker**. Start it once; it comes
   back automatically on every reboot.
2. **The desktop app** — a native macOS **Boardly.app** (built with Tauri) — installed like any
   other app. It talks to the backend on your machine.

Your data lives only on this laptop (in Docker's Postgres volume). Nothing leaves the machine.

```
┌────────────────────────┐        http://localhost:8788        ┌──────────────────────────┐
│  Boardly.app (desktop) │ ───────────────────────────────────▶ │  boardly-server (Docker) │
│  Tauri + web bundle    │ ◀───── ws://localhost:8788/sync ───── │  Fastify + Hocuspocus    │
└────────────────────────┘                                       └────────────┬─────────────┘
                                                                               │
                                                                  ┌────────────▼─────────────┐
                                                                  │  boardly-db (Docker, PG) │
                                                                  │  snapshots + auth        │
                                                                  └──────────────────────────┘
```

> **Ports.** The production backend uses host port **8788** on purpose — different from the dev
> server (8787) — so you can keep the Docker backend running while occasionally running the dev
> server. The desktop app is built to point at 8788.

---

## Prerequisites

- **Docker Desktop** — running. That's all you need to *use* the app once it's built.
- To **rebuild** the desktop app or the backend image you also need (already set up on this machine):
  - Node **22.17.1** + pnpm **11.1.3** — use the pinned bin:
    `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`
  - Rust (`cargo`) — for the Tauri build.

---

## 1. Start the backend (one command)

From the repo root:

```bash
cp .env.example .env      # first time only — defaults are fine
docker compose up -d --build
```

This builds the server image (first time only, ~1 min) and starts two containers:

- `boardly-db` — Postgres (pinned to **postgres:16** to match the existing data volume).
- `boardly-server` — the sync/API server on **http://localhost:8788**. It runs its DB migrations
  automatically on start.

Both have `restart: unless-stopped`, so after a reboot they start again on their own once Docker
Desktop is up. You never need to run the server by hand.

**Verify it's healthy:**

```bash
docker compose ps                       # both services "Up"; db "(healthy)"
curl http://localhost:8788/health       # → {"status":"ok","db":"up"}
```

Useful day-to-day commands:

```bash
docker compose logs -f server           # follow server logs
docker compose stop                     # pause the backend
docker compose up -d                    # resume
docker compose down                     # stop & remove containers (data is KEPT in the volume)
```

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
export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
export NEXT_PUBLIC_API_URL=http://localhost:8788
pnpm --filter @boardly/desktop tauri:build
```

`NEXT_PUBLIC_API_URL` bakes the backend URL into the web bundle. If you omit it the app defaults to
`http://localhost:8787` (the dev port) and won't reach the Docker backend — always set 8788 for the
production build. Then reinstall from the new `.dmg` (or copy the fresh `Boardly.app` over the old
one in `/Applications`).

---

## 3. First run

1. Make sure the backend is up (`docker compose ps`).
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
export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
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

- **Wipe all data and start fresh** (destroys every account and board):
  ```bash
  docker compose down -v      # -v also removes the Postgres volume
  docker compose up -d --build
  ```
- **Uninstall the app**: drag `/Applications/Boardly.app` to the Trash.
- **Remove the backend entirely**: `docker compose down -v` then delete the images if you like
  (`docker image rm boardly-server postgres:16`).

---

## Troubleshooting

**`curl localhost:8788/health` fails / app can't reach the server**
- Is Docker Desktop running? Is the stack up? `docker compose ps`.
- Check logs: `docker compose logs server`.

**`boardly-db` is "unhealthy" / restarting after an image change**
- A newer Postgres major can't open a data dir created by an older one. Keep `POSTGRES_IMAGE` in
  `.env` matching the volume (currently `postgres:16`). To move majors you must dump & restore, or
  wipe with `docker compose down -v` (loses data).

**Port already in use (8788 or 5433)**
- Something else is on the port. Change it in `.env`: `BOARDLY_SERVER_PORT=…` (server) or
  `POSTGRES_PORT=…` (Postgres). If you change the server port, rebuild the app with the matching
  `NEXT_PUBLIC_API_URL`.

**Login works but sync/refresh silently fails (CORS)**
- The server only accepts browser-credentialed calls from allow-listed origins. The desktop app's
  webview origin is included by default (`tauri://localhost`). If a future macOS/Tauri version uses
  a different origin, find it in the logs — `docker compose logs server | grep -i origin` (or watch
  the network tab) — and add it to `CORS_ORIGINS` in `.env`, then `docker compose up -d`.

**"Apple cannot check it for malicious software"**
- Expected for an unsigned local build. Right-click → Open once (see step 2).
