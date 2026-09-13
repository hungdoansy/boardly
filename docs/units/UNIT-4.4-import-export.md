# UNIT 4.4: Import / export (JSON, Markdown, Obsidian-Kanban)

- **Plan unit:** 4.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 4)
- **Status:** done
- **Requirements:** R10
- **Dependencies:** 1.1 (Yjs board schema) — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshots:** `docs/units/screenshots/UNIT-4.4-menu-dark.png` (Export/Import menu),
  `docs/units/screenshots/UNIT-4.4-imported-dark.png` (a board imported from Obsidian-Kanban markdown)

## What changed

Export a board to JSON (full-fidelity) or Markdown (readable), and import from JSON or
Obsidian-Kanban markdown into a **new** board.

- `packages/domain/src/io/` (new, pure — no Yjs):
  - `snapshot.ts` — `BoardSnapshot` (JSON-serializable mirror: board meta, labels, columns, cards
    with every field + order) and its **zod schema** `boardSnapshotSchema` (the import validation
    boundary; lenient defaults so a minimal file still imports). `SNAPSHOT_VERSION = 1`,
    `ImportError`.
  - `json.ts` — `exportJson(snapshot)` (pretty), `parseJson(text)` (validate → `BoardSnapshot`,
    throws `ImportError` on any problem, with a field path).
  - `markdown.ts` — `exportMarkdown(snapshot)`: `# Board` / `## Column` / `- [ ] card` outline,
    terminal (done/canceled/archived) cards as `- [x]`; structurally re-importable by the Obsidian
    parser.
  - `obsidian.ts` — `parseObsidian(text, title?)`: maps `## Column` headings + `- [ ]`/`- [x]` task
    items to columns/cards (checked → Done status), ignores the leading `# Title`, YAML front-matter,
    and `%% kanban:settings … %%` blocks; generates ids/ords. Throws `ImportError` if no columns.
  - Zod added to `@boardly/domain` deps (`4.4.3`, exact).
- `packages/sync/src/board-doc.ts`:
  - `boardToSnapshot(doc, boardId)` — read a live (non-archived) board into a `BoardSnapshot`.
  - `buildBoardFromSnapshot(doc, snapshot, now)` — populate a fresh board doc verbatim (ids, ords,
    fields, timestamps), so a JSON export round-trips exactly. Idempotent-guarded.
- `packages/commands/src/commands/io.ts` (new): `exportBoard` (returns the snapshot) and
  `importBoard` (input validated by the shared `boardSnapshotSchema`; registers a board ref + builds
  the doc). Registered in the catalog → available over REST/MCP identically to the UI.
- `apps/web/components/board/import-export.tsx` (new): an **Export** menu (Popover) — Export as JSON /
  Export as Markdown (client download) and Import board… (file picker → `parseJson`/`parseObsidian`
  → `importBoard` → selects the new board; inline error on a malformed file). Wired into the
  workspace header.
- `apps/server/src/routes/boards.ts`: made `POST /boards` **race-safe** — a concurrent duplicate
  registration of the same new board id (the client can fire twice) now resolves as an idempotent
  update instead of surfacing a 500 unique-violation. Surfaced by the import e2e; see below.

## Why

- **Snapshot is the interchange contract.** Keeping a plain, versioned `BoardSnapshot` in the pure
  domain (with the zod schema as the single validation boundary) means JSON/Markdown/Obsidian all
  target one shape, the sync layer is the only place that touches Y.Docs, and REST/MCP import
  validates identically to the UI (agent-native parity).
- **Import is atomic.** `parseJson`/`parseObsidian` fully validate and build the snapshot _before_
  any board is created — a malformed file throws `ImportError` and nothing is written (no partial
  board). Import always targets a **new** board, never mutating an existing one.
- **Full fidelity via verbatim rebuild.** `buildBoardFromSnapshot` writes ids/ords/fields exactly,
  so `export → import` reproduces columns, cards, order, labels, and every field (round-trip
  equality — tested at the doc level).
- **Race-safe registration (found by this unit's e2e).** The import reliably fired two concurrent
  `POST /boards` for the new id; the old select-then-insert hit a `23505` unique violation → 500.
  The write is now wrapped so a concurrent duplicate falls through to the idempotent owner-checked
  path. This is a robustness fix to the Unit 3.8 registry, kept minimal and covered by a new test.

## How it works

- **Export:** `ImportExportMenu` runs `exportBoard` → `BoardSnapshot`, serializes with
  `exportJson`/`exportMarkdown`, and downloads a Blob (`<board>.json` / `.md`).
- **Import:** reads the file; a `.md`/`.markdown` name or a non-`{` first char routes to
  `parseObsidian`, else `parseJson`. The resulting snapshot goes to `importBoard`, which adds a
  workspace board ref and calls `buildBoardFromSnapshot`; the UI then selects the new board.
- **Obsidian mapping:** headings after the first `#` become columns; task list items become cards in
  the current column; `[x]` → `Done`, `[ ]` → `Todo`. Card ords are generated with `keyBetween`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (domain):** `pnpm --filter @boardly/domain test` — `io/io.test.ts`: JSON round-trip
  (`export→parse` deep-equals; minimal-file defaults); malformed import is atomic (non-JSON, missing
  `columnId` with path, out-of-range priority all throw `ImportError`); Markdown outline (terminal →
  `[x]`); Obsidian import (headings→columns, tasks→cards in the right column, checked→Done, ordered,
  no-columns→throw). 60 domain tests pass.
- **Unit (sync):** `pnpm --filter @boardly/sync test` — `io.test.ts`: full **doc → snapshot → JSON →
  new doc → snapshot** equality; columns (order + wipLimit) / cards (fields) / labels / assignment
  preserved; build-from-Obsidian; idempotent guard. 38 sync tests pass.
- **Unit (commands):** `pnpm --filter @boardly/commands test` — `exportBoard`→`importBoard`
  round-trip into a new board; malformed snapshot rejected by zod (nothing created). 9 tests pass.
- **Server (DB up):** `pnpm --filter @boardly/server test` — new "concurrent duplicate registration
  … without a 500" (4 parallel registrations → all 200/201, exactly one 201). 71 tests pass.
- **e2e (Playwright, dark, server + build):** opened the **Export** menu (JSON / Markdown / Import);
  imported `sprint.md` (Obsidian-Kanban) → a new "Sprint 7" board with Backlog/In Progress/Done and
  `[x]` cards rendered terminal (`UNIT-4.4-*-dark.png`). Confirmed the earlier `POST /boards` 500 is
  gone (0 console errors, no failed requests). Checked against `DESIGN.md`.
- **Gates:** `pnpm -r typecheck`, `pnpm --filter @boardly/web lint`, `pnpm --filter @boardly/web
build`, `pnpm format:check` — all green. Exact deps (`zod 4.4.3`). Docker `boardly-db` up.

## Follow-ups / known gaps

- ~~**Markdown export is intentionally lossy** (structure + done-state only) — JSON is the
  full-fidelity format.~~ ~~**Obsidian imports** don't carry priority/labels/dates.~~
  **Both removed by UNIT-22** (`docs/units/UNIT-22-desktop-export-and-json-only.md`). JSON is now
  the only import/export format: `markdown.ts` and `obsidian.ts` are deleted and the picker accepts
  `.json` only. The lossiness above is why — and `parseObsidian` minting fresh card ids on every
  parse was the sole reason the import mode picker ever needed a disabled option.
- ~~**Import always creates a new board**; merging into / replacing an existing board is
  deferred.~~ **Closed by UNIT-21** (`docs/units/UNIT-21-import-modes.md`). Import now targets
  the caller's existing board doc in one of three modes — Replace, Merge, Add as copy — and
  `buildBoardFromSnapshot`'s create-once guard, which had turned import into a silent no-op
  after the single-doc migration, is gone.
- **Large-file guardrails** (size cap, streaming) are not added; boards are small in practice.
- ~~Export downloads a Blob.~~ **Fixed by UNIT-22** — the blob `<a download>` click was silently
  ignored by the Tauri webview, so desktop export was a dead click. It now goes through
  `apps/web/lib/save-file.ts`: the OS save sheet on desktop, the download on web.
