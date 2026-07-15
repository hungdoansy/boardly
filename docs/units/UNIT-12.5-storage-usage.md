# UNIT 12.5: Storage usage endpoint

- **Plan unit:** 12.5 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 5)
- **Status:** done
- **Requirements:** R6 (Settings shows db + files usage vs configured caps)
- **Commit(s):** _(this commit)_

## What changed

- **`apps/server/src/routes/storage.ts`** (new) — `GET /api/storage` (Bearer). Returns
  `{ database: { usedBytes, limitBytes }, files: { usedBytes, limitBytes } }`. Also exports the pure
  `dirSizeBytes(dir)` helper.
- **`apps/server/src/app.ts`** — registers `storageRoutes` alongside the attachment routes (when
  `database && keys`), passing `UPLOADS_DIR`, `DATABASE_LIMIT_BYTES`, `UPLOADS_LIMIT_BYTES`.
- **Tests:** `apps/server/src/routes/storage.test.ts` — pure `dirSizeBytes` tests + real-db route
  integration.

(The config values were added in UNIT-12.1.)

## Why (decisions)

- **`pg_database_size(current_database())`** for db usage — the standard total-database-size function;
  the app's own role can read it (`db.execute(sql\`…\`)`). node-postgres returns the bigint as a
string, coerced with `Number`(a ~1 GB db is far within`Number.MAX_SAFE_INTEGER`).
- **Disk walk for files usage, not the `size_bytes` column sum.** The walk reflects _true_ bytes on
  the volume, including any abandoned-upload orphans (there is no GC), which is exactly what the ~5 GB
  cap is about. A missing `UPLOADS_DIR` (nothing uploaded yet) is `0`.
- **Board-wide totals, not per-user.** Single-user tool; any authenticated user gets the totals.
- **Limits come from config and are returned in the response** so the client renders the meter
  without hardcoding caps.

## How it works

`authenticateBearer` (401 if absent) → `select pg_database_size(current_database())` → recursive
`dirSizeBytes(UPLOADS_DIR)` (sum of regular-file sizes, nested included, missing-dir → 0) → JSON with
both `usedBytes` and the configured `limitBytes`.

## How to test / verify

- Pure `dirSizeBytes` tests run in the default db-free suite (missing dir → 0; nested sum).
- Real-db route tests:
  `DATABASE_URL=… pnpm --filter @boardly/server test src/routes/storage.test.ts` → 5 passed
  (401 unauth; 200 with correct caps + a known 500-byte file counted; missing dir → 0 files).
- **Real HTTP** against the running dev server: `GET /api/storage` unauth → `401`; authed →
  `{"database":{"usedBytes":9419799,"limitBytes":1073741824},"files":{"usedBytes":70,"limitBytes":5368709120}}`
  — `files.usedBytes` matched the 70-byte PNG uploaded during the UNIT-12.4 check, confirming the walk
  is accurate. `typecheck` + `lint` clean.

## Follow-ups / known gaps

- No short-cache on the directory walk — walking a personal board's handful/thousands of files is
  sub-ms; add a small TTL only if the file count ever makes it noticeable.
- The `*_LIMIT_BYTES` are **display caps** only; enforcing a hard upload limit is deferred (see the
  plan). The Settings meter (UNIT-12.6) consumes this endpoint.
