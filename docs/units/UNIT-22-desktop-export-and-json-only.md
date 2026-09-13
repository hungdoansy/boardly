# UNIT-22 — Native save dialog for export; JSON as the only format

Two changes to the same surface: export now works on the desktop at all, and markdown
import/export is gone.

## What changed

### The bug: export was a dead click on the desktop

`ImportExportMenu` serialized the board and handed it to a local `download()` helper that
built a blob URL and clicked a synthetic `<a download>`. That is a browser-only API. **The
Tauri WKWebView has no download manager**, so the anchor click was silently ignored:
clicking "Export as JSON" in the desktop window did nothing, with no error anywhere. It
worked in a browser at `localhost:3000` and was dead in the shipped app — so the feature
was broken in the only place the app actually ships.

This is the second instance of the same class as UNIT-9.4, where `target="_blank"` also
silently no-opped inside the webview.

### Web

- **`apps/web/lib/save-file.ts`** (new) — `saveFile(filename, text, mime)`, the platform
  branch. Desktop opens the OS save sheet (`dialog.save`) and writes the chosen path
  (`fs.writeTextFile`); web keeps the blob-anchor download, moved here verbatim. Same
  dynamic-import, never-throw shape as `open-external.ts`.
  - Returns a three-state `SaveOutcome` — `saved` / `cancelled` / `failed` — not a boolean.
- **`apps/web/components/board/import-export.tsx`** — the local `download()` is deleted;
  `doExportJson` is async, calls `saveFile`, and surfaces the outcome through the existing
  `toast()`. The **Export as Markdown** item, the `parseObsidian` import branch, and the
  `hasStableIds` field are removed; the file input accepts `.json,application/json`.
- **Deps (exact-pinned):** `@tauri-apps/plugin-dialog` `2.7.3`, `@tauri-apps/plugin-fs` `2.5.2`.

### Domain

- **`packages/domain/src/io/markdown.ts`** and **`obsidian.ts`** deleted, with their two
  `export *` lines in `io/index.ts` and their two `describe` blocks in `io/io.test.ts`.
- `packages/sync/src/io.test.ts` used `parseObsidian` purely as a fixture builder in two
  tests (including the UNIT-21 anti-regression case). Both now build the same snapshots
  from JSON literals; **every assertion is unchanged**.

### Desktop shell

- `Cargo.toml`: `tauri-plugin-dialog = "2"`, `tauri-plugin-fs = "2"`.
- `src/main.rs`: `.plugin(tauri_plugin_dialog::init())`, `.plugin(tauri_plugin_fs::init())`.
- `capabilities/default.json`:
  ```json
  "dialog:allow-save",
  {
    "identifier": "fs:allow-write-text-file",
    "allow": [{ "path": "**" }]
  }
  ```

## Why

**Three outcomes, not a boolean.** Cancelling the save sheet is a _choice_, not a failure.
Collapsing the two would show "Couldn't save the file" to someone who deliberately
dismissed the dialog. So `cancelled` is silent, `failed` is loud, `saved` names the file.

**The failure is surfaced, never swallowed.** `open-external.ts`'s JSDoc records why: the
UNIT-9.4 opener bug shipped broken precisely because a `catch {}` turned a permanently
dead feature into an indistinguishable dead click. `saveFile` catches to avoid throwing,
but the caller always learns.

**Why `fs:allow-write-text-file` is scoped to `**`.** Per the Tauri docs, _a permission
alone grants no scope_, and a path returned by `dialog.save()` is **not** automatically
added to the fs scope — without an `allow` entry the write fails at runtime with
`forbidden path` even though the permission is enabled. That is the empty-`allow` signature
from `docs/solutions/integration-issues/tauri-permission-granted-but-url-scope-empty.md`.
The broad path scope is deliberate: the path is one the user _just chose in an OS-native
dialog_, so the OS dialog is the access-control boundary. Narrowing to `$DOCUMENT` or
`$DOWNLOAD` would reject a perfectly ordinary save to the Desktop or an external drive.
The _command_ scope stays narrow (`dialog:allow-save`, not `dialog:default`), the same
reasoning UNIT-9.4 used for `opener:allow-open-url`.

**Why markdown went entirely rather than being hidden.** JSON is the full-fidelity format;
the markdown outline was explicitly lossy (structure + done-state only, no projects, views,
labels or archived cards), and `parseObsidian` minted a fresh id for every card on every
parse — which is the _only_ reason the mode picker ever needed a disabled state. Deleting
it removes a whole conditional branch from the import flow rather than leaving dead code
behind a hidden menu item.

## How it works

One choke point. Everything that writes a file goes through `saveFile`, which branches on
`isTauri()` once. The component never knows which platform it is on; it only reacts to the
outcome. Because the branch lives in `lib/`, the web build never bundles or executes plugin
code — the plugin imports are inside the desktop branch.

With markdown gone, `PendingImport` carries only the snapshot, and every mode option
renders unconditionally: there is no source that lacks stable ids any more.

## How to test / verify

- **Unit — `apps/web/lib/save-file.test.ts`** (6 cases): web path clicks the anchor and
  revokes the blob URL, leaving no stray node; desktop calls `save()` then `writeTextFile`
  with the chosen path and a JSON filter; **`save()` returning `null` yields `cancelled`,
  not `failed`**; a `forbidden path` rejection (the scope bug's JS signature) yields
  `failed`; a rejecting dialog never attempts a write.
- **Unit — `import-export.test.tsx`** (6 new): the snapshot reaches `saveFile` rather than
  a browser download, and carries real seeded cards; success toasts the filename; failure
  toasts rather than closing on a dead click; cancel stays silent; JSON is the only export
  format; the picker accepts `.json` only. **This surface previously had zero export
  coverage, which is why the bug shipped.**
- **Suite:** `pnpm -r test` → **875** (domain 197, sync 107, commands 61, server 69,
  web 415, ui 14, mcp 7, logo 5). `pnpm typecheck` and `pnpm lint` → 9/9 each.
- **Rust:** `cargo check` in `apps/desktop/src-tauri` (needs
  `PATH="$HOME/.cargo/bin:$PATH"` — cargo is not on the agent shell's PATH).
- **Resolved ACL, not the source JSON:**
  `apps/desktop/src-tauri/target/debug/build/boardly-*/out/capabilities.json` must show
  `fs:allow-write-text-file -> [{'path': '**'}]`. An `allow: []` is the known bug.
- **The check that actually matters — invoke it from a running window.** Scope is enforced
  only on the IPC path, so a Rust-side smoke test would falsely pass. In `tauri dev`: click
  **Export as JSON**, confirm the native save sheet appears, save, confirm the toast names
  the file, and open the written file.

## Follow-ups / known gaps

- **Import still uses `<input type="file">`.** It already opens the native picker inside
  the webview and works on both platforms, so it was deliberately left alone. Routing it
  through `dialog.open()` would remember the last directory and apply a real file-type
  filter (the `accept` attribute is only a hint) — worth doing if import ever grows.
- `saveFile` takes a `mime` argument that only the web branch uses; the desktop branch
  derives its filter from the extension. Harmless today with one format.
