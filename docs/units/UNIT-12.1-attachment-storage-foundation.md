# UNIT 12.1: Attachment storage foundation

- **Plan unit:** 12.1 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 1)
- **Status:** done
- **Requirements:** R3 (bytes on disk, one code path for dev + prod), R4 (metadata in Postgres only)
- **Commit(s):** _(this commit)_

## What changed

Foundational plumbing so later units have a table to write metadata to, a config-driven place to
write bytes, and a real disk location in both stacks. No behavior is wired yet.

- **`apps/server/src/db/schema.ts`** — new `attachments` table + added to the exported `schema` map.
  Columns: `id uuid pk default random`, `user_id uuid not null → users(id) on delete cascade`,
  `mime_type text not null`, `size_bytes integer not null`, `original_name text`,
  `created_at timestamptz not null default now()`, plus a btree index `attachments_user_id_idx` on
  `user_id`.
- **`apps/server/drizzle/0002_brown_wonder_man.sql`** — generated (offline) migration creating the
  table, FK, and index. Applied at boot by the existing `migrate.ts` (no code change there).
- **`apps/server/src/config.ts`** — four new env vars (validated/coerced by the existing zod schema):
  - `UPLOADS_DIR` (default `./data/uploads`) — where image bytes are written.
  - `MAX_UPLOAD_BYTES` (default `10_485_760` = 10 MiB) — per-file upload cap (used by Unit 12.2).
  - `DATABASE_LIMIT_BYTES` (default `1_073_741_824` = 1 GiB) — display cap for the storage meter.
  - `UPLOADS_LIMIT_BYTES` (default `5_368_709_120` = 5 GiB) — display cap for the storage meter.
- **`docker-compose.prod.yml`** — new named volume `uploads` mounted at `/data/uploads` on the
  `server` container, with `UPLOADS_DIR=/data/uploads`. Renders as `boardly-prod_uploads`.
- **`docker-compose.yml`** — header comment documenting that the host dev server writes to
  `./data/uploads` (no volume; server isn't containerized in dev).
- **`.gitignore` / `.dockerignore`** — ignore `data/` so local uploads are never committed or baked
  into the image.
- **`docs/GUIDE-local-production.md`** — documents the `uploads` volume, the `down -v` wipe caveat
  (both volumes go), the backup note, and a row in the dev/prod comparison table.
- **Tests:** `apps/server/src/db/schema.test.ts` (attachments in `EXPECTED_TABLES`; new db-free block
  asserting the export + column shape) and `apps/server/src/config.test.ts` (defaults, coercion,
  non-numeric rejection).

## Why (decisions)

- **Bytes on disk, metadata in Postgres.** Keeps the Yjs doc and doc-state table free of binary bloat;
  disk is cache-friendly and cheap. (Plan Key Technical Decisions.)
- **Owned by a user, not a card.** Cards live in the Yjs doc, not Postgres, so a `card_id` FK is
  impossible. The link is the `/attachments/<id>` markdown reference; the row references `users.id`
  with `on delete cascade` (deleting an account reclaims its rows).
- **One `UPLOADS_DIR` code path.** Prod points it at a Docker volume, dev at a local folder — only the
  value differs, so the upload/serve code (Unit 12.2) never branches on environment.
- **`uploads` mirrors `pgdata`.** Same isolation and `down -v` wipe semantics, so it rides the
  existing backup/reset story rather than inventing a new one.

## How it works

`drizzle-kit generate` diffed `schema.ts` and emitted `0002_brown_wonder_man.sql`; `runMigrations`
applies it idempotently at server boot. The four config values are parsed by the same `loadConfig`
zod schema that guards every other env var, so a bad value fails fast at boot with a readable error.

## How to test / verify

- `pnpm --filter @boardly/server test` — 31 passed, db-integration suites skipped (no `DATABASE_URL`).
- Against the dev db, the migration + schema suite passes (5/5), proving the migration applies and
  `attachments` exists:
  `DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test src/db/schema.test.ts`
- `pnpm --filter @boardly/server typecheck` — clean.
- `docker compose -f docker-compose.prod.yml config` — renders `boardly-prod_uploads`, the
  `/data/uploads` mount, and `UPLOADS_DIR=/data/uploads`.

## Follow-ups / known gaps

- Upload/serve routes, the actual byte writes, and `mkdir -p UPLOADS_DIR` at boot land in Unit 12.2.
- No automatic cleanup of orphaned/obsolete images this iteration (deliberate — see the plan's Scope
  Boundaries → Deferred). Growth is made visible instead by the storage meter (Units 12.5/12.6).
