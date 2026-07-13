# UNIT-9.4 — Desktop opens external links (Tauri opener)

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 1).

## What changed

Clicking a link in the card drawer now opens it in the OS default browser on the desktop app, and
in a new tab on web — fixing the desktop bug where links did nothing.

- **JS dep** (`apps/web/package.json`): added `@tauri-apps/plugin-opener` pinned at `2.5.4`.
- **Helper** (`apps/web/lib/open-external.ts`): `openExternal(url)` — bails unless
  `isSafeHttpUrl(url)`; on desktop (`isTauri()`) dynamically imports the opener plugin and calls
  `openUrl(url)` (never throws — try/catch like `notify.ts`); on web calls
  `window.open(url, "_blank", "noopener,noreferrer")`.
- **Links renderer** (`apps/web/components/card/links.tsx`): the `<a>` keeps its `href`/`target`;
  its `onClick` intercepts (`preventDefault` + `openExternal`) **only** when `isTauri()`, so web
  keeps native anchor behavior (cmd/middle-click, new tab).
- **Desktop shell:**
  - `apps/desktop/src-tauri/Cargo.toml`: `tauri-plugin-opener = "2"` (resolved to `2.5.4`).
  - `apps/desktop/src-tauri/src/main.rs`: `.plugin(tauri_plugin_opener::init())`.
  - `apps/desktop/src-tauri/capabilities/default.json`: granted `opener:allow-open-url`.

## Why

- Tauri v2's webview does not hand a `target="_blank"` navigation to the OS browser on its own, so
  desktop links were dead. The opener plugin is the supported way to open a URL externally, and it
  mirrors the existing native-capability pattern (`@tauri-apps/plugin-notification` +
  `tauri-plugin-notification` + a capability grant).
- Intercepting **only** under `isTauri()` fixes desktop without regressing web — the native anchor
  (and its cmd/middle-click affordances) is untouched in the browser.
- The http(s)-only guard keeps the existing XSS posture (`javascript:`/`data:`/app-scheme URLs are
  no-ops, same as the add-link guard).

## How it works

`openExternal` is the single choke point. On desktop it lazy-imports the plugin (so the web bundle
never eagerly loads Tauri code) and swallows any failure. The link `onClick` calls it only on
desktop; on web the browser handles the anchor natively.

## How to test / verify

- **Unit tests (all green):**
  - `apps/web/lib/open-external.test.ts` (hoisted mocks for `isTauri` + the opener module):
    web → `window.open` with `_blank`/`noopener`; desktop → `openUrl`; non-http(s) URLs are a
    no-op on both; a failing opener call is swallowed (resolves, never throws).
  - `apps/web/components/card/links.test.tsx`: a link renders as an anchor with the correct
    `href`/`target` (web opens natively); the existing non-http XSS-guard test still holds.
- **Rust wiring:** `cargo check` in `apps/desktop/src-tauri` finishes successfully with the opener
  plugin registered and the capability resolved; `tauri-plugin-opener 2.5.4` is in `Cargo.lock`.
- **DoD run (Node 22.17.1):** web typecheck clean; lint clean (exit 0); `vitest run` = 422 passed /
  37 skipped; `@boardly/web` build compiles.

## Follow-ups / known gaps

- The one thing not exercised here is the **runtime** click → OS-browser on a launched desktop
  build (requires `pnpm --filter @boardly/desktop tauri:build`/`dev`, not run this session). The
  JS path is unit-tested, the Rust shell compiles, and the capability is granted, so this is a
  smoke-check only — open a card's link in the packaged app and confirm the system browser opens.
