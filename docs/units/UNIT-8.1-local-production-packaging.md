# UNIT-8.1 — Local production packaging (Docker backend + desktop build)

Phase 6 ("Polish & ship: packaging") — make Boardly runnable as a real, solo, laptop-only product:
the backend fully containerized and self-restarting, and the desktop app built as an installable
native macOS bundle. No new features; this is deployment/packaging plumbing.

## What changed

- **`apps/server/Dockerfile`** (new) — image for the sync/API server.
- **`.dockerignore`** (new, repo root) — keeps the build context to source + manifests.
- **`docker-compose.prod.yml`** (new) — the isolated, all-Docker **production** stack (`db` +
  `server`), with its own compose project (`name: boardly-prod`), containers (`boardly-prod-db`,
  `boardly-prod-server`), volume (`boardly-prod_pgdata`), and network. Server on host port **8788**.
- **`docker-compose.yml`** — now the **dev database only** (`boardly-dev-db`, port 5433), for a
  host-run dev server. (The `server` service moved to the prod file — see Why #5.)
- **`.env` / `.env.example`** — `POSTGRES_IMAGE` pinned to `postgres:16`; documented
  `BOARDLY_SERVER_PORT` (production host port, default **8788**) and `CORS_ORIGINS`.
- **Tauri updater removed** so a release build needs no code-signing keys:
  `apps/desktop/src-tauri/tauri.conf.json` (dropped `plugins.updater`, version → `1.0.0`, added
  `localhost:8788` to the CSP `connect-src`), `src/main.rs` (dropped the updater plugin registration),
  `Cargo.toml` (dropped `tauri-plugin-updater`, version → `1.0.0`), `capabilities/default.json`
  (dropped `updater:default`).
- **`docs/GUIDE-local-production.md`** (new) — the end-user runbook.

## Why

Confirmed decisions for a single-user, single-laptop deployment:

1. **Server in Docker (not host).** Previously only Postgres was containerized and the server ran on
   the host via `tsx`. Containerizing it too means one command brings up the entire backend and
   `restart: unless-stopped` brings it back after a reboot — genuinely set-and-forget. No terminal
   needs to stay open.
2. **Disable the auto-updater.** The config pointed at a non-existent remote release server
   (`releases.boardly.app`) and, more practically, the updater plugin makes `tauri build` require a
   signing keypair. For a self-built laptop app there is nothing to update *from* and no reason to
   manage signing keys — you rebuild locally. (Deliberate deviation from the Phase-6 "Tauri
   auto-update" roadmap item; re-add it if Boardly ever ships to other machines.)
3. **Production port 8788, separate from dev 8787.** Keeps the always-on Docker backend from
   colliding with an occasional `pnpm --filter @boardly/server dev` on 8787. The desktop build bakes
   `NEXT_PUBLIC_API_URL=http://localhost:8788` into the web bundle.
4. **Don't auto-seed.** First run is a clean account; the demo seed is one documented command.
5. **Production and dev are fully isolated stacks** (not one shared backend). The production stack
   (`docker-compose.prod.yml`, project `boardly-prod`) has its own db/volume/network and runs the
   server in Docker on 8788; local dev (`docker-compose.yml`, project `boardly`) is just the dev db
   on 5433 with the server run on the host (8787, hot reload). This lets the user *use* the
   production app while *developing* against a separate database — neither touches the other. The
   existing PG16 data volume stays the dev database; production starts on a fresh volume.

Two problems surfaced and were fixed during bring-up:

- **`ERR_PNPM_IGNORED_BUILDS: sharp`.** A full-workspace `pnpm install` in the image exits non-zero
  under pnpm 11 because `sharp` (a Next/web transitive dep) has an ignored build script. Fixed by
  installing only the server's subtree — `pnpm install --frozen-lockfile --filter "@boardly/server..."`
  — which excludes web deps entirely (also shrinks the image). `sharp` is genuinely unused (the web
  build is a static export with `images.unoptimized`).
- **Postgres major mismatch.** The compose default (`postgres:17`) refused the existing
  `boardly_pgdata` volume, which was initialized by Postgres 16 → crash loop. Pinned
  `POSTGRES_IMAGE=postgres:16` to match and preserve existing data.

## How it works

- **Image** (`apps/server/Dockerfile`): `node:22.17.1-slim`, pnpm via corepack, copy repo, filtered
  frozen install, `CMD ["pnpm","start"]` → `tsx src/index.ts`. The server runs Drizzle migrations at
  boot from `apps/server/drizzle` (`src/db/migrate.ts` resolves `../../drizzle` — same under `tsx`),
  so the container is self-migrating; no separate migrate step.
  - **NODE_ENV** is intentionally *not* set at image-build time (pnpm would drop `tsx`); it's passed
    as `production` at run time by compose, after `tsx` is installed.
- **Compose (prod)** `server` service: `depends_on: db (service_healthy)` gates boot on Postgres
  readiness; `DATABASE_URL` targets host `db` on the internal port **5432** (not the host-mapped
  5433); `CORS_ORIGINS` defaults to `http://localhost:3000,tauri://localhost,https://tauri.localhost`;
  published as `${BOARDLY_SERVER_PORT:-8788}:8787`. The prod `db` publishes **no** host port (only
  `server` reaches it, over the compose network). `name: boardly-prod` isolates the project's
  containers/volumes/network from the default (`boardly`) dev project, so
  `docker compose -f docker-compose.prod.yml …` and plain `docker compose …` never collide.
- **Desktop**: `pnpm --filter @boardly/desktop tauri:build`. Tauri's `beforeBuildCommand` runs the
  web static export; the Rust shell wraps `apps/web/out`. Output under
  `apps/desktop/src-tauri/target/release/bundle/` (`macos/Boardly.app`, `dmg/Boardly_1.0.0_aarch64.dmg`).
  The webview loads over `tauri://localhost` and calls `http://localhost:8788` (CSP-allowed;
  `localhost` is a secure context so http from the tauri origin isn't blocked). The refresh token is
  stored in the OS keychain (Rust `keyring` commands), so desktop auth doesn't depend on a
  cross-origin cookie.

## How to verify

Backend (production stack):
```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps       # db (healthy) + server Up
curl -s localhost:8788/health                      # {"status":"ok","db":"up"}
docker compose -f docker-compose.prod.yml logs server   # "migrations applied" + "listening ... (sync on /sync)"
```
Isolation: the prod db starts empty while the dev db (`boardly-dev-db`) keeps its existing data —
verified `select count(*) from users` = 0 in `boardly-prod-db` vs. the populated dev db, and an
old dev account returns 401 against 8788.
Desktop, end-to-end (the real proof):
1. Build (command above), confirm `Boardly.app` + `.dmg` exist under `target/release/bundle/`.
2. Install, launch, sign up, create a project + card.
3. **Quit and relaunch** → data persists (app ↔ server ↔ Postgres round-trip).
4. Optional: run the demo seed (`API_URL=http://localhost:8788 tsx …seed-demo-board.ts`) and sign in
   as `demo@boardly.app`.

## Follow-ups / known gaps

- **Unsigned build.** macOS Gatekeeper needs a one-time right-click→Open (documented). Proper
  signing/notarization is out of scope for a laptop-only app.
- **Image size.** Single-stage install with devDeps (`tsx`) present at runtime. A multi-stage
  `pnpm deploy` + compiled `dist` slim-down is possible later; unnecessary for solo use.
- **CORS origin.** `tauri://localhost` is correct for current macOS Tauri; if a future version
  changes the webview origin, add it to `CORS_ORIGINS` (see the guide's troubleshooting).
- **Auto-update** intentionally removed — see Why #2.
