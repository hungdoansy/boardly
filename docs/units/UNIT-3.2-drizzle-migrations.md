# UNIT 3.2: Drizzle schema + migrations

- **Plan unit:** 3.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R3, R9
- **Dependencies:** 3.1 — satisfied
- **Commit(s):** _this unit's commit_

## What changed

The relational schema and a committed `generate → migrate` flow, applied automatically at server
boot.

- `apps/server/src/db/schema.ts` — Drizzle `pg-core` schema for all five tables plus a `bytea`
  `customType` mapping Postgres `bytea` ↔ `Uint8Array` (Yjs state):
  - `users(id uuid pk, email unique, password_hash, created_at)`
  - `refresh_tokens(id, user_id → users cascade, token_hash, family_id, expires_at, revoked_at, created_at)`
  - `boards(id, owner_id → users cascade, title, created_at, updated_at, archived)`
  - `yjs_documents(doc_name pk, state bytea, updated_at)`
  - `link_metadata_cache(url pk, title, icon_url, fetched_at)`
- `apps/server/src/db/client.ts` — `createDb(connectionString)` → `{ pool, db }` (Drizzle
  `node-postgres`), typed `Database`.
- `apps/server/src/db/migrate.ts` — `runMigrations(db)` runs `migrate()` against the committed SQL
  in `apps/server/drizzle/`; idempotent (already-applied migrations are skipped by hash).
- `apps/server/drizzle.config.ts` — drizzle-kit config (`dialect: postgresql`, schema →
  `./src/db/schema.ts`, out → `./drizzle`).
- `apps/server/drizzle/0000_dizzy_mindworm.sql` + `meta/` — **committed** generated migration.
- `apps/server/src/index.ts` — boot now creates the db, `runMigrations()` **before** listening
  (exits 1 on failure), reuses the pool for `/health`, and closes both on shutdown.
- `apps/server/package.json` — `db:generate` / `db:migrate` scripts; deps pinned: `drizzle-orm
0.45.2`, dev `drizzle-kit 0.31.10`.
- `.prettierignore` — `apps/server/drizzle/**` (machine-generated; never reformat).
- `pnpm-workspace.yaml` — esbuild allow-list note extended to drizzle-kit.
- Tests: `apps/server/src/db/schema.test.ts` (real-db integration, gated on `DATABASE_URL`).

## Why (decisions)

- **`generate` + `migrate`, never `push`** (the plan's "do your own migrations" requirement). The
  SQL is generated offline from `schema.ts`, committed, and applied by hash at boot — so migrations
  are auditable, reviewable in diffs, and re-runnable. `push` (schema-diff-on-connect) is banned
  because it leaves no artifact and can silently drop columns.
- **Migrate at boot, in `index.ts`, before `listen`.** The server never serves against an
  un-migrated db; a migration failure aborts startup with a clear error rather than surfacing as
  runtime query errors. Idempotency (drizzle's `__drizzle_migrations` ledger) makes re-boot safe.
- **`bytea` custom type ↔ `Uint8Array`.** Yjs document state is a `Uint8Array`; node-postgres
  returns `Buffer` for `bytea`. The `customType` wraps `Buffer` as `Uint8Array` on read and copies
  bytes on write, so app code never touches `Buffer` and the round-trip is byte-exact (tested).
- **`uuid` PKs with `gen_random_uuid()`** (built into Postgres 13+), `timestamptz` everywhere, and
  `on delete cascade` from `refresh_tokens`/`boards` to `users` — deleting a user cleans up their
  tokens and boards.
- **`createDb` returns the pool; the caller owns its lifecycle.** Boot passes that pool to
  `buildServer` (so `/health` and future routes share one pool) and closes it on shutdown.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Generate:** `pnpm --filter @boardly/server db:generate` re-emits identical SQL from `schema.ts`
  (offline, no db).
- **Integration (Docker exercised), gated on `DATABASE_URL`:**
  ```sh
  docker compose up -d db   # (POSTGRES_IMAGE=postgres:16 if 17 can't be pulled)
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
    pnpm --filter @boardly/server test
  ```
  `schema.test.ts`: migrations create every expected table; a **second** `runMigrations` is a no-op
  (the `drizzle.__drizzle_migrations` count is unchanged); a `Uint8Array` round-trips through the
  `bytea` column byte-for-byte. Confirmed in-container: `\dt` lists all 5 tables, the migration
  ledger has exactly 1 row, and `yjs_documents.state` is `bytea`.
- **Default suite stays db-free:** without `DATABASE_URL`, `schema.test.ts` (and the 3.1 health
  integration test) skip — `pnpm -r test` shows server `3 passed | 4 skipped`.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`, `pnpm --filter
@boardly/server build`, `pnpm format:check` — all green. No user-facing UI, so no Playwright
  screenshot applies.

## Follow-ups / known gaps

- **Auth (3.3)** uses `users` + `refresh_tokens` (rotation/reuse-detection).
- **Yjs persistence (3.5/3.6)** writes `yjs_documents.state`; the byte-exact `bytea` mapping is the
  foundation.
- **Indexes** beyond PK/unique (e.g. `refresh_tokens.user_id`, `boards.owner_id`) are deferred until
  the query patterns in 3.3+ make the right ones obvious.
- The `postgres:17` vs cached `postgres:16` note from Unit 3.1 still applies (registry was
  unreachable this run); the schema is standard SQL and version-agnostic.
