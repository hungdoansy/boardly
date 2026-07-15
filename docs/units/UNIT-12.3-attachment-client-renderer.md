# UNIT 12.3: Web attachment module + authenticated image renderer

- **Plan unit:** 12.3 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 3)
- **Status:** done
- **Requirements:** R5 (auth-gated display), R7 (reuse `react-markdown`, no new editor lib)
- **Commit(s):** _(this commit)_

## What changed

- **`apps/web/lib/attachments.ts`** (new) — the client broker (mirrors `unfurl-client.ts`):
  - `uploadAttachment(file)` — posts multipart via `apiClient.authFetch("/api/attachments")`,
    returns `{ id }`, throws `AttachmentUploadError` on any failure.
  - `attachmentRef(id)` → `/attachments/<id>` (single source of truth for the reference shape).
  - `attachmentIdFromSrc(src)` → the id for an owned reference, else `null` (external image).
  - `useAttachmentObjectUrl(src)` — for an owned reference, `authFetch`es the bytes and exposes an
    object URL, revoking it on unmount / id-change; returns `{ objectUrl, external, loading, error }`.
- **`apps/web/components/card/attachment-image.tsx`** (new) — `AttachmentImage`, the `react-markdown`
  `img` override. Renders loaded / loading-skeleton / broken states for owned images and a plain
  `<img>` for external URLs. Wired into the editor preview in Unit 12.4.
- **`docs/design/DESIGN.md`** — new §7.3 "Description images (attachments)": the three render states,
  tokens, and the `ImageOff` lucide broken-image icon (SVG, never a glyph).
- **Tests:** `apps/web/lib/attachments.test.ts` (10) and
  `apps/web/components/card/attachment-image.test.tsx` (3).

## Why (decisions)

- **Authenticated blob fetch → object URL** (the chosen approach). `<img src>` can't carry a Bearer
  header and the API is a different origin, so the renderer fetches bytes via `authFetch` and shows
  `URL.createObjectURL(blob)`. True auth, nothing sensitive in the URL.
- **Root-relative `/attachments/<id>` reference.** Origin-independent (dev :8787 / prod :8788 /
  desktop `tauri://`) and survives `react-markdown`'s URL sanitizer; the browser never resolves it —
  the renderer parses the id and fetches from `API_BASE_URL` via `authFetch`.
- **Revoke on unmount and id-change.** The effect tracks the created object URL and revokes it in
  cleanup, so a long-open drawer doesn't leak blobs.
- **External images pass through untouched** so a pasted `https://…` image still renders.

## Design (UI unit)

Per DESIGN.md §7.3: loaded image is `max-w-full` + `--radius-md` + `--border-subtle` hairline +
`my-2`; loading is a `h-40 max-w-sm` `animate-pulse` skeleton on `--bg-elevated` so the preview
doesn't jump; broken is an `ImageOff` SVG + "Image unavailable" chip on `--bg-surface`. Dark-mode
first (all tokens are theme variables). No bespoke colors/radii.

## How it works

`useAttachmentObjectUrl` keys its effect on the parsed id. On an owned id it sets `loading`, fetches
via `authFetch`, converts the response to a `Blob`, creates an object URL, and stores it; a
`cancelled` flag + `created` capture in the cleanup guarantee the URL is revoked and no state is set
after unmount. `AttachmentImage` renders external → plain `<img>`; error → broken chip; loading →
skeleton; else → `<img>` bound to the object URL.

## How to test / verify

- `pnpm --filter @boardly/web test attachments.test.ts attachment-image.test.tsx` → 13 passed.
  Covers: reference round-trip; external/malformed detection; upload success, non-ok, network-throw,
  and missing-id failures; hook success (object URL created, revoked on unmount); external no-fetch;
  serve-404 error state; id-change revoke+refetch; component external/owned/broken rendering.
- `pnpm --filter @boardly/web typecheck` + `lint` clean. (jsdom lacks object-URL APIs, so the tests
  stub `URL.createObjectURL`/`revokeObjectURL`.)

## Follow-ups / known gaps

- The editor paste/drop wiring and the `components={{ img: AttachmentImage }}` hookup land in Unit
  12.4.
- No client-side image compression/downscale before upload — out of scope this iteration.
