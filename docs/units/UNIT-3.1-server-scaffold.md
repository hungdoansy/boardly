# UNIT 3.1: Docker Postgres + `apps/server` (Fastify) scaffold

- **Plan unit:** 3.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R3, R9
- **Dependencies:** 0.1 — satisfied
- **Commit(s):** _this unit's commit_

## What changed

A Dockerized Postgres and a booting Fastify server with a DB-backed `/health` check — the foundation
the rest of Phase 3 (migrations, auth, sync) builds on.

- `docker-compose.yml` (root) — service `db` on `postgres:17` with a named volume
  (`boardly_pgdata`), a `pg_isready` healthcheck, and env-driven credentials. Host port defaults to
  **5433** (via `${POSTGRES_PORT:-5433}`) to avoid colliding with a local Postgres on 5432.
- `.env.example` — Postgres credentials + `DATABASE_URL`/`PORT`/`HOST`. `.env` is already git-ignored.
- `apps/server/src/config.ts` — `loadConfig()`: zod-validated env. `DATABASE_URL` is required; a
  missing/invalid value throws one readable error listing every problem.
- `apps/server/src/app.ts` — `buildServer({ config, pool? })`: constructs the Fastify instance
  (no `.listen`, so tests drive it with `inject()`), owns a `pg` `Pool`, and serves `GET /health`
  (runs `SELECT 1`; `200 {status:"ok",db:"up"}` or `503 {status:"degraded",db:"down"}`).
- `apps/server/src/index.ts` — boot entry: load config (exit 1 with a clear message if invalid),
  `listen` on `HOST:PORT`, and close cleanly on `SIGINT`/`SIGTERM`.
- `apps/server/package.json` — deps pinned exactly: `fastify 5.10.0`, `pg 8.22.0`, `zod 4.4.3`;
  dev `tsx 4.23.0`, `@types/pg 8.20.0`. Scripts: `dev`/`start` (tsx), `typecheck`/`build` (tsc),
  `lint`, `test`.
- `pnpm-workspace.yaml` — `onlyBuiltDependencies: [esbuild]` (tsx needs esbuild's platform binary;
  it was the first workspace dep to legitimately need a build script).
- `vitest.config.ts` — added `apps/server` to the projects list; `apps/server/vitest.config.ts`
  (node environment).
- Tests: `apps/server/src/config.test.ts` (always) and `health.integration.test.ts` (real db,
  gated on `DATABASE_URL`).

## Why (decisions)

- **`buildServer` factory, no top-level listen.** The app is a pure factory so tests use Fastify's
  `inject()` (no open port, fast, deterministic); `index.ts` is the only thing that binds a socket.
- **`DATABASE_URL` required, validated at boot.** Failing immediately with a single clear error
  (the plan's edge case) beats a confusing failure on the first query. zod is already the repo's
  boundary validator, so config reuses it.
- **`pg` Pool for the health check now; Drizzle layers on in 3.2.** `pg` is the driver Drizzle's
  `node-postgres` adapter uses, so it's not throwaway. `/health` doing a real `SELECT 1` makes the
  check meaningful (liveness _and_ DB connectivity), not a static 200.
- **Host port 5433 default.** Dev machines commonly already run Postgres on 5432; defaulting the
  mapped port to 5433 avoids a surprising bind conflict while staying overridable via `POSTGRES_PORT`.
- **`generate`+`migrate` not `push`** is a 3.2 concern, but the compose volume is named and
  persistent here so 3.2's migrations survive restarts.
- **Server runs on the host in dev, DB in Docker.** Matches the plan; keeps the fast edit-run loop
  (tsx watch) while the stateful dependency is containerized and reproducible.
- **`tsx` for running, not compiled output.** With `moduleResolution: bundler`, emitted JS keeps
  extensionless imports that Node ESM won't resolve; `tsx` runs the TS directly. `build` (`tsc`)
  stays as the typecheck/emit gate.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit:** `pnpm --filter @boardly/server test` — `config.test.ts`: missing `DATABASE_URL` throws a
  clear error; a valid env parses with defaults (`PORT 8787`, `HOST 0.0.0.0`); `PORT` coerces from a
  string. The integration test **skips** here (no `DATABASE_URL`), so `pnpm -r test` stays db-free.
- **Integration (Docker exercised):**
  ```sh
  cp .env.example .env
  docker compose up -d db          # becomes healthy (pg_isready)
  docker inspect --format '{{.State.Health.Status}}' boardly-db   # -> healthy
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
    pnpm --filter @boardly/server test   # /health returns 200 {status:ok,db:up}
  ```
  Confirmed on this machine: `boardly-db` reached `healthy`, the gated integration test ran (not
  skipped) and passed, and a live boot — `pnpm --filter @boardly/server start` →
  `curl localhost:<PORT>/health` — returned `{"status":"ok","db":"up"}` (HTTP 200). Unsetting
  `DATABASE_URL` exits 1 with `Invalid server configuration: DATABASE_URL: …`.
  - **Environment note:** the Docker registry was unreachable during this run (even `hello-world`
    timed out), so verification used the already-cached **`postgres:16`** via
    `POSTGRES_IMAGE=postgres:16 docker compose up -d db`. The compose default remains **`postgres:17`**
    (`image: ${POSTGRES_IMAGE:-postgres:17}`); any modern Postgres satisfies this scaffold and 3.2's
    standard-SQL migrations. Re-run with the default once the registry is reachable.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test` (server 3 pass + 1
  skipped), `pnpm --filter @boardly/server build`, `pnpm format:check` — all green. No user-facing
  UI, so no Playwright screenshot applies.

## Follow-ups / known gaps

- **Migrations & schema (3.2)** land next: Drizzle client + `migrate()` at boot against this db.
- **`/health` is liveness only** (a `SELECT 1`); readiness/latency and structured logging arrive
  with the real API surface.
- The integration test is gated on `DATABASE_URL` so the default suite needs no Docker; CI that
  wants it runs `docker compose up -d db` and sets the env var (documented above).
