# UNIT 12.2: Attachment upload + serve routes

- **Plan unit:** 12.2 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 2)
- **Status:** done
- **Requirements:** R3 (bytes on disk), R5 (authenticated; owner-only serve), R8 (agent-native — plain HTTP)
- **Commit(s):** _(this commit)_

## What changed

- **`apps/server/src/routes/attachments.ts`** (new) — a Fastify plugin exposing:
  - `POST /api/attachments` — multipart upload (Bearer). Stores one image under `UPLOADS_DIR/<id>`
    and inserts the metadata row; returns `201 { id }`.
  - `GET /attachments/:id` — streams the bytes back to the **owner** (Bearer). 404 for a missing id,
    a wrong-owner id, a malformed id, or a row whose file is gone.
  - Exported pure helper `sniffImageMime(buffer)` for magic-byte detection (unit-tested standalone).
- **`apps/server/src/app.ts`** — registers `@fastify/multipart` (scoped inside the attachment plugin)
  and mounts `attachmentRoutes` when `database && keys` are present, passing `config.UPLOADS_DIR` and
  `config.MAX_UPLOAD_BYTES`. `index.ts` needed no change — it already passes the whole `config`.
- **`apps/server/package.json`** — new dependency `@fastify/multipart` pinned to **`10.1.0`** (pulls
  transitive `@fastify/busboy@3.2.0`). Supports Fastify 5.
- **Tests:** `apps/server/src/routes/attachments.test.ts` — pure sniffer tests (always run) + 8
  real-db/real-disk integration tests (skipped without `DATABASE_URL`, matching the repo convention).

## Why (decisions)

- **Validate declared MIME _and_ magic bytes.** The declared `content-type` must be in the allowlist
  (`image/png|jpeg|gif|webp`) **and** the sniffed leading bytes must equal it. A `.png` carrying PDF
  bytes is rejected (415). We never trust the header alone.
- **Buffer-then-validate (cap-bounded).** The file is drained into a buffer (bounded by the multipart
  `fileSize` limit) before type checks, so the request never hangs on an early reject and we have the
  leading bytes to sniff. A 10 MiB cap makes buffering cheap.
- **404, never 403, on ownership mismatch.** Both "no such id" and "not your attachment" return 404 so
  the endpoint never confirms another user's attachment exists.
- **Serve `content-type` from the stored row; `cache-control: private, …, immutable`.** Bytes are
  immutable per id, so they cache hard — but privately, since the route is auth-gated.
- **Directory created lazily.** The upload handler does `mkdir(UPLOADS_DIR, { recursive: true })`
  before the first write, so no boot-time mkdir is needed (resolves that deferred question). The
  storage endpoint (Unit 12.5) treats a missing dir as 0 bytes.
- **Multipart scoped to the plugin.** `@fastify/multipart` is registered _inside_ `attachmentRoutes`
  (encapsulated) so it doesn't alter body parsing for other routes.

## How it works

Upload: `authenticateBearer` → `request.file()` → `toBuffer()` (a file past the cap throws or sets `file.truncated` → 413) → allowlist + `sniffImageMime` check (→ 415) → `writeFile(UPLOADS_DIR/<id>)` → insert row (on
insert failure the file is `unlink`ed so no orphan is left) → `201 { id }`. The generated `id` is the
filename, so there is no user-controlled path component (no traversal risk); `original_name` is stored
as metadata only (sliced to 255 chars), never used for the filesystem path.

Serve: `authenticateBearer` → UUID-shape check on `:id` (bad shape → 404, avoids a Postgres uuid-cast 500) → row lookup → owner check → `stat` the file (missing → 404 + server log) → stream with
content-type/length + immutable cache header.

## How to test / verify

- Pure sniffer tests run in the default db-free suite: `pnpm --filter @boardly/server test`.
- Full integration against the dev db:
  `DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test src/routes/attachments.test.ts`
  → 10 passed. Covers: 201 + file-on-disk + row; owner serve 200 byte-identical + content-type +
  immutable cache; 401 upload/serve; cross-user 404; unknown/malformed/missing-file 404; non-image
  415 (no file, no row); over-cap 413; no-file-part 400.
- Whole server suite green with the db: 78 passed. `typecheck` + `lint` clean.

## Follow-ups / known gaps

- **Multiple file parts:** the handler reads the first file and ignores extras (our client only ever
  sends one). Not an error; documented here rather than rejected.
- **Hard storage cap (507 at `UPLOADS_LIMIT_BYTES`)** is intentionally not wired — display-only this
  iteration (see the plan). The per-file cap (`MAX_UPLOAD_BYTES`, 413) _is_ enforced.
- No image processing (resize/thumbnail/EXIF-strip) — out of scope.
