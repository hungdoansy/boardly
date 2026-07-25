# UNIT-15 — Whole-app zoom (in / out / reset), persisted & synced

Plan: [`docs/plans/2026-07-24-001-feat-app-zoom-persist-sync-plan.md`](../plans/2026-07-24-001-feat-app-zoom-persist-sync-plan.md)

## What changed

Added whole-app zoom driven by the standard `⌘/Ctrl +`, `⌘/Ctrl −`, `⌘/Ctrl 0`
shortcuts. Zooming scales the **entire** UI uniformly — board, cards, sidebar,
toolbar, and all portaled overlays (dialogs, popovers, command palette,
card-detail drawer). The level is a per-user board preference: persisted, synced
across devices, and restored flash-free on load.

**Data / command layer**

- `packages/domain/src/zoom.ts` (new) — `DEFAULT_ZOOM` (1), `ZOOM_MIN` (0.5),
  `ZOOM_MAX` (2), `ZOOM_STEPS` (the discrete ladder), and pure `clampZoom` /
  `zoomIn` / `zoomOut`. Exported from `packages/domain/src/index.ts`.
- `packages/domain/src/types.ts` — `Board.zoom: number`.
- `packages/sync/src/schema.ts` — `boardToPlain` reads `zoom` with
  `clampZoom(getNumber(meta, "zoom", DEFAULT_ZOOM))` (clamps defensively on read).
- `packages/sync/src/board-doc.ts` — `setZoom(doc, factor, now)` (transact,
  clamped write).
- `packages/commands/src/commands/board.ts` — `setZoom` command
  (`input: { factor: number }`, clamps via the sync writer); registered in
  `packages/commands/src/catalog.ts`.
- `apps/web/lib/use-board.ts` — `useZoom()` / `useSetZoom()` hooks.

**Apply / persistence layer**

- `packages/ui/src/theme.css` — `--app-zoom: 1` base token.
- `apps/web/app/globals.css` — `html { zoom: var(--app-zoom, 1) }`.
- `apps/web/lib/zoom.ts` (new) — device layer: `applyZoom` (stamps `--app-zoom`
  on `<html>`), `parseZoom`, `readCachedZoom`, `cacheZoom` (localStorage
  `boardly-zoom`).
- `apps/web/app/layout.tsx` — `ZOOM_INIT` no-FOUC inline script applies the
  cached factor before first paint.
- `apps/web/components/app/workspace-app.tsx` — `Shell` applies + caches the
  synced `useZoom()` value in an effect and mounts `useZoomHotkeys`.

**Shortcuts + discoverability**

- `apps/web/lib/use-zoom-hotkeys.ts` (new) — window keydown for the three
  chords; `preventDefault` on each.
- `apps/web/components/command-palette/palette.tsx` — Zoom in / out / Reset
  actions (Reset shows the live %).
- `apps/web/components/settings/general-settings.tsx` — a Zoom control
  (−/+/Reset with a live percentage readout).

**Docs:** `docs/design/DESIGN.md` § 3.1 (new).

## Why

> **Superseded in part (2026-07-25).** The "Zero Rust / one JS+CSS path" rationale
> below was the original design; it was later split by platform — see
> [Fix: native webview zoom on desktop](#fix-native-webview-zoom-on-desktop-css-zoom-is-web-only-2026-07-25).
> Desktop now drives the native webview zoom; the CSS-var lever is the web fallback.

- **`zoom`, not `transform: scale`.** The type scale is absolute px (`body` 12px;
  `--text-*` all px, no rem — UNIT-12.1), so a base-font-size change does not
  cascade. CSS `zoom` scales px tokens **and reflows** (more cards fit), which is
  the desired board behavior. `transform: scale` would overflow, break
  `position: fixed`, and not reflow.
- **Applied on `<html>`** because Radix overlays portal to `document.body`;
  scaling the document root is what makes zoom truly whole-app (overlays scale
  too) rather than board-only.
- **Zero Rust.** The desktop menu (`apps/desktop/src-tauri/src/main.rs`) binds no
  zoom accelerator, so `⌘ +/−/0` keydowns already reach the webview → one JS+CSS
  implementation serves web and desktop identically. Avoids a
  Rust-View-menu→`webview.set_zoom` path that would bypass the persisted CSS
  value and diverge the two platforms.
- **Synced source of truth + device cache.** Board-meta `zoom` is the synced
  truth (mutated via the `setZoom` command → agent-native parity, R13). A
  `localStorage` mirror + pre-paint inline script restores the last level with no
  100%→level flash, exactly like theme/focus.
- **`preventDefault` on the chord** suppresses the browser's own native zoom in
  the web app, so `⌘ +` steps one app level instead of double-zooming.

## How it works

> Steps 3–4 below describe the **web** apply path. On desktop the apply step
> calls the native webview zoom instead (see the Fix section); the command/sync
> steps (1–2) are identical on both platforms.

1. `⌘/Ctrl +/−/0` (or a palette/Settings action, or an agent) calls the `setZoom`
   command with the next factor from `zoomIn`/`zoomOut`/`DEFAULT_ZOOM`.
2. `setZoom` clamps and writes `meta.zoom` in the board Y.Doc → syncs to the
   user's other devices.
3. `useZoom()` (a `useY` selector on board meta) re-renders `Shell`; an effect
   calls `applyZoom(zoom)` (sets `--app-zoom` on `<html>`) and `cacheZoom(zoom)`.
4. `html { zoom: var(--app-zoom, 1) }` scales the whole UI (and body portals).
5. On next load, `ZOOM_INIT` applies the cached factor before first paint; once
   the Y.Doc hydrates, the synced value re-applies (and refreshes the cache).

## How to test / verify

**Automated** (`pnpm test`, all green):

- `packages/domain/src/zoom.test.ts` — clamp bounds, non-finite fallback, step
  in/out incl. saturation at MIN/MAX and between-steps snapping.
- `packages/sync/src/board-doc.test.ts` (`zoom board meta`) — default 1,
  round-trip, write-time + read-time clamp, uninitialized-doc default.
- `packages/commands/src/commands/board.test.ts` (`setZoom`) — sets/clamps,
  rejects non-number via zod.
- `packages/commands/src/catalog.test.ts` — `setZoom` registered.
- `apps/web/lib/zoom.test.ts` — `applyZoom` stamps/clamps, `parseZoom`,
  cache round-trip.
- `apps/web/lib/use-zoom-hotkeys.test.ts` — ⌘=/⌘-/⌘0 map + `preventDefault`,
  Ctrl parity, clamp, ignores bare `=` and other chords, ref freshness, cleanup.
- `apps/web/components/settings/general-settings.test.tsx` (`zoom`) — 100% start,
  Reset disabled at default, in/out steps, Reset returns to 100%.

**Manual / e2e (dark mode first):**

- In the web app, `⌘ +/−/0` zoom the UI; the browser's native zoom does **not**
  also fire; reload restores the level with no flash.
- At 150%, open a dialog, popover, command palette, and the card-detail drawer —
  all scale.
- **Drag-and-drop at 75% and 150%** — a card dropped in a column lands correctly
  (dnd-kit coordinates under CSS `zoom`).
- Desktop (Tauri) build: same shortcuts zoom; level persists across restart.
- Dark-mode screenshots at 75% / 100% / 150%.

## Fix: native webview zoom on desktop; CSS zoom is web-only (2026-07-25)

**Symptom (desktop):** zooming out shrank the app into part of the window (empty
gutter); after several steps the layout broke — content overflowed and cut off
Settings/Account (zoom-out), or collapsed into the top-left with a large empty
area (zoom-in).

**Root cause:** element-level CSS `zoom` cannot reliably fill the window. `zoom`
paints a box at `size × zoom`, but the containing block resolved for `100%`/`vh`
does **not** track the factor — and Chromium and WebKit (the Tauri webview)
resolve this **oppositely**, and even **asymmetrically between zoom-in and
zoom-out within one engine**. So every "size the container to `100% / zoom`"
compensation that fills one engine/direction breaks another. There is no single
static CSS formula that fills both engines. (This was verified the hard way —
multiple compensation attempts each fixed one case and broke another.)

**Fix — split the apply layer by platform (chosen after weighing options with
the maintainer):**

- **Desktop (Tauri) → native webview zoom.** `apps/web/lib/zoom.ts` `applyZoom`
  now branches on `isTauri()`: on desktop it calls
  `getCurrentWebview().setZoom(factor)` (dynamic `import("@tauri-apps/api/webview")`)
  and pins `--app-zoom` to `1` so the CSS lever is inert. The webview's _native_
  zoom rescales the layout viewport itself, so it reflows and fills the window
  exactly — the thing CSS `zoom` can't do. Requires the
  `core:webview:allow-set-webview-zoom` capability
  (`apps/desktop/src-tauri/capabilities/default.json`).
- **Web (Chromium/Firefox) → CSS `zoom` on `<html>`** (unchanged lever), kept as
  a pragmatic fallback. Standard content-zoom: it scales + reflows the whole UI
  (incl. body-portaled overlays) but can leave a gutter on zoom-out / scroll on
  zoom-in. Acceptable for the web build; desktop is the fully-correct path.
- `apps/web/app/layout.tsx` — the no-FOUC `ZOOM_INIT` script now **skips on
  desktop** (`__TAURI_INTERNALS__`/`__TAURI__` present) so it doesn't briefly
  double-zoom (CSS + native) before hydration.

The command/sync/persist layer, the `⌘/Ctrl +/−/0` hotkeys, and the palette /
Settings controls are unchanged — they all still drive the synced `setZoom`
value; only the _apply_ step differs by platform.

Rule of thumb: **never rely on element CSS `zoom` to fill the window** — for a
desktop webview use the engine's native zoom; on the web accept standard
content-zoom.

## Follow-ups / known gaps

- **Web fill is imperfect** — the web fallback uses element CSS `zoom`, so
  zoom-out can leave a gutter and zoom-in can scroll. If web fidelity matters
  later, consider letting the browser's own zoom handle ⌘+/− on web (perfect
  fill, but not scriptable → no palette/Settings control, no persist) or a
  transform-based content-zoom with portals routed into the zoom layer.
- **Desktop zoom re-applies after load (brief 100% flash)** — native webview
  zoom is not persisted by the webview across reloads; the Shell effect
  re-applies the synced factor on mount, so there can be a brief 100% flash
  before it snaps to the saved level. If it's noticeable, set the initial zoom
  Rust-side on window creation.

- **`⌘/Ctrl + mouse-wheel` / pinch zoom** — intentionally deferred. A per-event
  wheel handler over-steps (pinch emits many `ctrl+wheel` events), so v1 is
  keyboard + palette + Settings only. Revisit with delta accumulation/throttle.
- **Desktop keydown assumption** — this build relies on `⌘ +/−/0` reaching the
  webview JS (no menu accelerator binds them). If a future WKWebView/menu change
  swallows them, add a Tauri `global-shortcut` that emits an event routed to
  `setZoom` (see the plan's Risks).
- **dnd-kit under `zoom`** — must be verified in the desktop WKWebView build
  (Chromium web is expected fine); if offset, apply a dnd-kit coordinate
  adjustment or fall back to desktop-native `webview.set_zoom`.
- **Synced across differing screen sizes** — one level syncs everywhere by
  design choice; if that proves annoying, flip the source of truth to
  `localStorage` (per-device) — a localized change in `use-board.ts` + the effect.
