# UNIT 12.4: Description editor paste / drag-drop → upload → insert

- **Plan unit:** 12.4 (`docs/plans/2026-07-15-001-feat-description-image-attachments-plan.md` → Unit 4)
- **Status:** done
- **Requirements:** R1 (paste), R2 (drag-drop), R7 (reuse `react-markdown`)
- **Commit(s):** _(this commit)_

## What changed

- **`apps/web/components/card/markdown-editor.tsx`** — the description editor now:
  - Handles **paste** and **drag-drop** of image files: inserts a placeholder at the caret, uploads
    via `uploadAttachment`, then replaces the placeholder in place with `![alt](/attachments/<id>)`.
  - Shows a **drag-over affordance** (accent border/ring) while files are dragged over, cleared on
    drop/leave.
  - Surfaces an inline `role="alert"` error and removes the placeholder if an upload fails.
  - Renders the **preview** with `components={{ img: AttachmentImage }}` so owned images display via
    the authenticated blob-fetch renderer (UNIT-12.3).
- **`apps/web/components/card/markdown-editor.test.tsx`** (new) — 6 tests.
- **`docs/design/DESIGN.md`** — §7.3 extended with the write-tab affordances (drag-over border,
  uploading placeholder, inline error).

The description text still flows through the existing `onChange` → `actions.setDescription` →
`setCardDescription` command (character-level Y.Text merge) — images ride _inside_ the markdown; no
new mutation path.

## Why (decisions)

- **Plain-text placeholder with a unique token** (`[uploading image <token>]`) rather than image
  syntax: it doesn't render as a broken image if the user flips to preview mid-upload, and the token
  lets concurrent uploads each replace only their own placeholder (no cross-clobber).
- **Replace against the latest value via a ref** (`valueRef`): async upload callbacks operate on the
  current text, so a placeholder is replaced correctly even if the description changed meanwhile.
- **`altFromFilename`** strips the extension and markdown-breaking chars (`[]()`) so the generated
  `![alt](…)` can't be malformed by a filename.
- **No `urlTransform` override needed:** react-markdown v9's default transform keeps root-relative
  URLs, so `/attachments/<id>` reaches `AttachmentImage` untouched (confirmed by the preview test).

## Design (UI unit)

Per DESIGN.md §7.3: drag-over → `--accent` border + 2px ring (`transition-colors`, `--dur-fast`);
uploading placeholder is plain text; failure shows a `--danger` inline alert. All tokens; dark-mode
first; no glyphs (the broken-image state uses the `ImageOff` SVG from UNIT-12.3).

## How to test / verify

- `pnpm --filter @boardly/web test markdown-editor.test.tsx` → 6 passed: paste→placeholder→reference;
  drop + drag-over affordance; plain-text paste ignored; two-image concurrent (independent refs);
  upload-failure alert + placeholder removed; **preview renders an owned image through the authed
  renderer** (proves react-markdown passes the root-relative ref through).
- `typecheck` + `lint` clean; full web suite green (239).
- **Real end-to-end over HTTP** (running dev server + dev db + disk): signup/login, then
  `POST /api/attachments` with a real 1×1 PNG → `201 {id}`; `GET /attachments/<id>` (owner) → `200`,
  `content-type: image/png`, `cache-control: …immutable`, bytes byte-identical; unauth → `401`;
  a text file declared `image/png` → `415`.

## Follow-ups / known gaps

- **Live browser paste + dark-mode screenshot** (paste a real screenshot into a card, confirm the
  inline render and that it survives a reopen) is the one remaining manual check; automated coverage
  (jsdom editor↔renderer + real-HTTP backend round-trip) is green.
- Caret is placed by the browser after a controlled-value update; we don't force a caret position
  after insertion (acceptable — the common case is pasting at the end).
- No paste/drop of non-image files (out of scope); non-image files in a drop/paste are ignored.
