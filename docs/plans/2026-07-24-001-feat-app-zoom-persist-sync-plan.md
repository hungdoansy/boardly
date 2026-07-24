---
title: "feat: Whole-app zoom (in / out / reset), persisted & synced"
type: feat
status: active
date: 2026-07-24
---

# feat: Whole-app zoom (in / out / reset), persisted & synced

## Overview

Add whole-app zoom controlled by the standard `⌘/Ctrl +`, `⌘/Ctrl −`, `⌘/Ctrl 0`
shortcuts (like a browser). Zooming scales the **entire** UI uniformly — board,
cards, sidebar, toolbar, and all portaled overlays (dialogs, popovers, command
palette, card-detail drawer). The zoom level is a **per-user board preference**:
persisted and synced across devices (mirroring `showEmptyColumns`), with a
device-local cache for instant, flash-free apply on load.

The mechanism is a single CSS lever — `html { zoom: var(--app-zoom, 1) }` — driven
from React and from a no-FOUC inline script. **No Rust / Tauri changes are
required**: because the desktop menu binds no zoom accelerators, `⌘ +/−/0`
keydowns already reach the webview's JS, so one JS + CSS implementation serves
both web and desktop identically.

## Problem Frame

Today there is no zoom at all. In a plain browser, native `⌘ +/−/0` zoom "works"
but is device-local, un-synced, and outside the app's control. In the **Tauri
desktop app** the shortcuts do nothing: `apps/desktop/src-tauri/src/main.rs`
installs a custom menu (App / Edit / Window submenus only) with **no View menu
and no zoom accelerators**, and `zoomHotkeysEnabled` is unset — so `⌘ +/−/0` are
inert. The user wants real zoom that behaves the same everywhere and remembers
where they left it (chosen: _whole-app zoom_, _both platforms, persist & sync_).

Constraint that shapes the approach: the type scale is **all absolute px**
(`body { font-size: 12px }`; `--text-xs: 10px` … — zero `rem` in
`packages/ui/src/theme.css`). Scaling by changing a base font-size would not
cascade. The `zoom` CSS property scales absolute px correctly **and reflows**
(so more cards actually fit), which is exactly the desired behavior — unlike
`transform: scale`, which would overflow, break `position: fixed`, and not reflow.

## Requirements Trace

- R1. `⌘/Ctrl +` zooms in, `⌘/Ctrl −` zooms out, `⌘/Ctrl 0` resets to 100%, in
  both the web app and the Tauri desktop app.
- R2. Zoom scales the **whole** UI uniformly, including portaled overlays
  (dialogs, popovers, command palette, card-detail drawer).
- R3. The zoom level persists and **syncs across devices** (per-user board
  preference), and restores on load **without a visible flash** (no-FOUC).
- R4. Zoom is clamped to a sane range and steps through predictable levels;
  reset returns to exactly 100%.
- R5. Agent-native parity (repo rule R13): the zoom change goes through the
  command layer, and is reachable from the command palette — any action a user
  can take, an agent can too.
- R6. Drag-and-drop, keyboard nav, and the focus-mode overlay continue to work
  correctly at non-100% zoom.

## Scope Boundaries

- **Not** a board-only / canvas "overview" zoom — the whole app scales, not just
  the board content.
- **Not** a continuous pinch-to-zoom trackpad gesture (pinch is out; `⌘ + wheel`
  is an optional enhancement in Unit 3, off the critical path).
- **No** Tauri/Rust changes: no View menu, no `zoomHotkeysEnabled`, no
  `webview.set_zoom`. (See Key Technical Decisions for why the pure JS+CSS path
  is preferred and the fallback if a WKWebView quirk forces a Rust path.)
- **Not** a per-device zoom model — the synced value is the source of truth
  (see Deferred to Separate Tasks for the per-device option).

### Deferred to Separate Tasks

- Per-device (un-synced) zoom, or a "sync zoom across devices" on/off toggle:
  future iteration if syncing one level across differently-sized screens proves
  annoying. The design keeps this a one-line source-of-truth swap.

## Context & Research

### Relevant Code and Patterns

- **Preference chain to mirror (`showEmptyColumns`)** — this is the exact
  template for a synced per-user board preference:
  - Read/default: `packages/sync/src/schema.ts` `boardToPlain()` (`getBool(meta, "showEmptyColumns", true)`).
  - Type: `packages/domain/src/types.ts:86` `interface Board` (`showEmptyColumns: boolean` at line 105).
  - Writer: `packages/sync/src/board-doc.ts` `setShowEmptyColumns(doc, show, now)` — `doc.transact` → `meta.set(...)` + `meta.set("updatedAt", now)`.
  - Command: `packages/commands/src/commands/board.ts` `setShowEmptyColumns` (`defineCommand`, zod input, calls the sync writer, returns `getBoard`).
  - Registration: `packages/commands/src/catalog.ts`.
  - Hooks: `apps/web/lib/use-board.ts` `useShowEmptyColumns()` / `useSetShowEmptyColumns()` (`useY(boardMeta(doc), …)` selector + `execute(command, ctx, input)` setter).
- **Device-local display pref + no-FOUC (`theme` / `focus`)** — the template for
  instant, flash-free apply:
  - `apps/web/lib/focus-mode.ts` — module store, `localStorage`, `applyFocus()` stamps `<html>`.
  - `apps/web/app/layout.tsx` — `THEME_INIT` / `FOCUS_INIT` inline `<script>` tags apply the cached value before first paint.
- **Schema helper:** `packages/sync/src/schema.ts:47` `getNumber(m, key, fallback = 0)` — read zoom with a `DEFAULT_ZOOM` fallback.
- **App root / keyboard mount:** `apps/web/components/app/workspace-app.tsx`.
  Note: its existing `useGlobalKeyboard` **deliberately bails on `metaKey || ctrlKey`** (so `⌘`-chords pass through) — zoom needs a _separate_ handler that fires _on_ those chords.
- **Board layout (what gets scaled/reflowed):** `apps/web/components/board/board-view.tsx` (flex column, 8 fixed status columns), `apps/web/components/board/column-cards.tsx`, `apps/web/components/board/dnd.tsx` (dnd-kit — see risks), `apps/web/components/board/keyboard-nav.tsx`.
- **Command palette:** `apps/web/components/command-palette/palette.tsx` (`CommandGroup heading="Actions"` + `CommandItem`s).
- **Design tokens:** `packages/ui/src/theme.css` (`:root`), `apps/web/app/globals.css` (base layer, `html/body`).

### Institutional Learnings

- `docs/units/UNIT-12.1` (context-menu/density): the type scale was set to a
  **12px absolute-px base**, and the memory note records that "absolute-px tokens
  don't cascade from body." This is _why_ zoom must be a page-`zoom` lever, not a
  base-font-size change.
- Desktop custom-menu rationale in `main.rs` (UNIT-11.1): the menu was hand-built
  to keep Edit shortcuts; it intentionally has no View menu — confirming no
  accelerator currently intercepts `⌘ +/−/0`.

### External References

- CSS `zoom` is a first-class, layout-reflowing zoom in Blink (Chromium, 2024+)
  and supported in WebKit (Tauri's macOS webview). Verify behavior in the actual
  desktop build (see Risks) — WebKit's `zoom` has historically differed from
  Chromium in edge cases.

## Key Technical Decisions

- **Lever = `html { zoom: var(--app-zoom, 1) }`, not `transform: scale`.** `zoom`
  reflows (more cards fit), scales absolute-px tokens, and keeps `position: fixed`
  / portals correct. `transform` would break all three.
- **Apply on `<html>` (document root), not an inner wrapper.** Radix overlays
  portal to `document.body`; scaling the root guarantees dialogs/popovers/palette
  scale too (R2).
- **Two-layer persistence, synced value wins.** Source of truth = board-meta
  `zoom` (per-user, synced, mutated via command → R3/R5). A `localStorage`
  mirror (`boardly-zoom`) drives a no-FOUC inline script so the last level is
  applied before first paint; once the Yjs doc hydrates, the synced value
  re-applies and refreshes the cache. Mirrors theme/focus exactly, plus the
  synced layer.
- **Pure JS+CSS, zero Rust.** The desktop menu binds no zoom accelerator, so
  `⌘ +/−/0` keydowns reach the webview → one handler serves both platforms.
  Avoids a Rust View-menu → `webview.set_zoom` path that would bypass the
  persisted CSS value and diverge web/desktop behavior.
- **`preventDefault` on the zoom chord is mandatory** — in the web browser it
  suppresses the browser's _own_ native zoom, preventing double-zoom.
- **Discrete step ladder + clamp.** A fixed `ZOOM_STEPS` array (e.g.
  `0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2`) with `⌘0 → 1`. Clamp
  `[0.5, 2]`. Predictable and easy to test.
- **Never transition `zoom`.** It is a reflow-heavy property; animating it fights
  the DESIGN rule against animating expensive layout. Apply instantly.

## Open Questions

### Resolved During Planning

- _What does "zoom" mean / where / persistence?_ → Whole-app zoom; both desktop
  and web; persisted **and synced** (user-selected).
- _Rust changes needed?_ → No; keydown reaches JS in the current menu setup
  (verify in Unit 3 desktop check; fallback in Risks).
- _px vs rem cascade problem?_ → Sidestepped entirely by using page `zoom`.

### Deferred to Implementation

- Exact `ZOOM_STEPS` values and whether `⌘ + wheel` ships in v1 or as a
  follow-up (Unit 3 marks it optional).
- Whether dnd-kit needs any coordinate adjustment at non-100% zoom — depends on
  observed WebKit/Chromium behavior (Unit 2/3 verification; Risks).

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review,
> not implementation specification. The implementing agent should treat it as
> context, not code to reproduce._

```
  ⌘/Ctrl +  ─┐
  ⌘/Ctrl −  ─┤  window keydown handler (Unit 3)
  ⌘/Ctrl 0  ─┘  e.preventDefault(); execute(setZoom, { factor })
                         │
       command palette ──┤ (Unit 4, agent-native)
       settings reset  ──┘
                         ▼
              setZoom command (Unit 1, zod + clampZoom)
                         ▼
        board-doc setZoom → meta.set("zoom", f)   ← Yjs, synced per-user
                         │
        useZoom() (useY selector)  ── re-renders on sync ──┐
                         ▼                                  │
   workspace-app effect (Unit 2): applyZoom(f)              │
     · documentElement.style --app-zoom = f                 │
     · localStorage "boardly-zoom" = f  ───────────────┐    │
                         ▼                              │    │
        html { zoom: var(--app-zoom,1) }  (whole UI + portals reflow)
                                                        │
   layout.tsx ZOOM_INIT inline <script> reads localStorage ┘
     → applies --app-zoom before first paint (no FOUC)
```

## Implementation Units

- [ ] **Unit 1: Zoom preference — domain constants, sync writer, command, hook**

**Goal:** Add `zoom` as a synced per-user board preference, mutated through the
command layer, with shared clamp/step math in `@boardly/domain`.

**Requirements:** R3, R4, R5

**Dependencies:** None

**Files:**

- Create: `packages/domain/src/zoom.ts` — `DEFAULT_ZOOM = 1`, `ZOOM_MIN`, `ZOOM_MAX`, `ZOOM_STEPS`, `clampZoom(f)`, `zoomIn(f)`, `zoomOut(f)` (next/prev step, clamped).
- Create: `packages/domain/src/zoom.test.ts`
- Modify: `packages/domain/src/index.ts` — `export * from "./zoom"`.
- Modify: `packages/domain/src/types.ts` — add `zoom: number` to `interface Board` (beside `showEmptyColumns`).
- Modify: `packages/sync/src/schema.ts` — in `boardToPlain()`: `zoom: clampZoom(getNumber(meta, "zoom", DEFAULT_ZOOM))`.
- Modify: `packages/sync/src/board-doc.ts` — `setZoom(doc, factor, now)` (transact: `meta.set("zoom", clampZoom(factor))` + `meta.set("updatedAt", now)`).
- Modify: `packages/commands/src/commands/board.ts` — `setZoom` command (`defineCommand`, `input: z.object({ factor: z.number() })`, calls sync `setZoom` with `clampZoom`, returns `getBoard`).
- Modify: `packages/commands/src/catalog.ts` — register `setZoom`.
- Modify: `apps/web/lib/use-board.ts` — `useZoom(): number` (`useY(boardMeta(doc), () => getBoard(doc, userId).zoom)`) and `useSetZoom(): (factor: number) => void` (`execute(setZoom, ctx, { factor })`).
- Test: `packages/domain/src/zoom.test.ts`, `packages/sync/src/board-doc.test.ts`, `packages/commands/src/commands/board.test.ts`, `packages/commands/src/catalog.test.ts`.

**Approach:** Mirror the `showEmptyColumns` chain end-to-end. Keep all clamp/step
logic pure in `@boardly/domain` so the command (boundary validation) and the UI
(keyboard stepping) share one source of truth. Read-time default only — never
_write_ default meta (matches the existing comment in `boardToPlain` about
last-writer-wins on fresh devices).

**Patterns to follow:** `setShowEmptyColumns` across `schema.ts` / `board-doc.ts`
/ `commands/board.ts` / `catalog.ts` / `use-board.ts`; `getNumber` in `schema.ts`.

**Test scenarios:**

- Happy path (domain): `zoomIn(1)` → next step up (e.g. `1.1`); `zoomOut(1)` → next step down (e.g. `0.9`); `clampZoom(1.0)` → `1.0`.
- Edge case (domain): `zoomIn(ZOOM_MAX)` stays at `ZOOM_MAX`; `zoomOut(ZOOM_MIN)` stays at `ZOOM_MIN`; `clampZoom(5)` → `ZOOM_MAX`, `clampZoom(0.1)` → `ZOOM_MIN`; a value between steps snaps to the correct neighbor.
- Happy path (sync): `setZoom(doc, 1.25, now)` → `getBoard(doc, "me").zoom === 1.25` and `updatedAt === now`.
- Edge case (sync/schema): fresh doc with no `zoom` meta → `boardToPlain().zoom === DEFAULT_ZOOM` (1); an out-of-range persisted value is clamped on read.
- Error path (command): `setZoom` with a non-number input rejected by zod; an out-of-range number is clamped (not rejected).
- Integration: `getCommand("setZoom")` is defined in the catalog.

**Verification:** `pnpm typecheck` + package tests green; `setZoom` appears in the
catalog; a round-trip through the command sets `Board.zoom`.

---

- [ ] **Unit 2: Apply zoom to the app root (CSS lever + no-FOUC)**

**Goal:** Make a numeric zoom factor scale the whole UI (incl. portals), apply
the synced value after hydration, and restore the cached value before first paint.

**Requirements:** R2, R3, R6

**Dependencies:** Unit 1

**Files:**

- Create: `apps/web/lib/zoom.ts` — `ZOOM_STORAGE_KEY = "boardly-zoom"`; `applyZoom(factor)` sets `--app-zoom` on `document.documentElement` (client-guarded); `readCachedZoom()` / `cacheZoom(f)` (localStorage, `clampZoom` + parse); mirror `focus-mode.ts` structure.
- Create: `apps/web/lib/zoom.test.ts`
- Modify: `packages/ui/src/theme.css` — add `--app-zoom: 1;` to `:root`.
- Modify: `apps/web/app/globals.css` — in `@layer base`, `html { zoom: var(--app-zoom, 1); }` with a comment: reflow-heavy, never transitioned.
- Modify: `apps/web/app/layout.tsx` — add a `ZOOM_INIT` inline `<script>` (beside `THEME_INIT`/`FOCUS_INIT`) that reads `boardly-zoom` and sets `--app-zoom` pre-paint.
- Modify: `apps/web/components/app/workspace-app.tsx` — an effect keyed on `useZoom()` that calls `applyZoom(zoom)` and `cacheZoom(zoom)` (synced value wins post-hydration and refreshes the cache).
- Modify: `docs/design/DESIGN.md` — document the `--app-zoom` token, whole-app zoom behavior, the no-transition rule, and the `⌘ +/−/0` shortcuts.

**Approach:** `applyZoom` writes the CSS var (not the `zoom` property directly) so
the value lives in one place and the inline script and React path converge on the
same lever. Applying on `<html>` covers `body`-portaled overlays. The inline
script gives instant restore from cache; the effect reconciles to the synced
board-meta value once Yjs loads.

**Patterns to follow:** `apps/web/lib/focus-mode.ts` (`applyFocus`, storage key,
client guard); `THEME_INIT`/`FOCUS_INIT` in `apps/web/app/layout.tsx`.

**Test scenarios:**

- Happy path: `applyZoom(1.25)` sets `documentElement.style` `--app-zoom` to `1.25`; `applyZoom(1)` → `1`.
- Edge case: `applyZoom` is a no-op (no throw) when `document` is undefined (SSR/static-export guard); `readCachedZoom()` returns `DEFAULT_ZOOM` when localStorage is empty or holds garbage.
- Integration: `cacheZoom(f)` then `readCachedZoom()` round-trips a clamped value.
- Integration (manual/e2e, not unit): at `zoom = 1.5`, open a dialog, a popover, the command palette, and the card-detail drawer — each is scaled (confirms root-level `zoom` reaches portals).

**Verification:** In dev, setting `Board.zoom` (via the command or a temporary
call) visibly scales the whole app including overlays; reloading restores the
level with no visible 100%→level flash. Dark-mode screenshots at 75% / 100% /
150%.

---

- [ ] **Unit 3: Zoom keyboard shortcuts (both platforms)**

**Goal:** `⌘/Ctrl +`, `⌘/Ctrl −`, `⌘/Ctrl 0` step / reset zoom through the command,
in web and desktop, suppressing native browser zoom.

**Requirements:** R1, R4, R5

**Dependencies:** Unit 1 (uses `useSetZoom` / `zoomIn` / `zoomOut` / `DEFAULT_ZOOM`), Unit 2 (visible effect)

**Files:**

- Create: `apps/web/lib/use-zoom-hotkeys.ts` — a hook attaching a `window` `keydown` listener: when `(e.metaKey || e.ctrlKey)` and `e.key` ∈ `{"=","+"}` → `setZoom(zoomIn(current))`; `{"-","_"}` → `setZoom(zoomOut(current))`; `{"0"}` → `setZoom(DEFAULT_ZOOM)`; each calls `e.preventDefault()`. Reads current via `useZoom()`. _(Optional, clearly marked: a `⌘/Ctrl + wheel` handler with `{ passive: false }` + `preventDefault` for continuous zoom.)_
- Create: `apps/web/lib/use-zoom-hotkeys.test.ts`
- Modify: `apps/web/components/app/workspace-app.tsx` — mount `useZoomHotkeys()` (separate from `useGlobalKeyboard`, which bails on modifier chords).

**Approach:** A dedicated handler is required precisely because the existing
`useGlobalKeyboard` returns early on `metaKey || ctrlKey`. `preventDefault` is the
crux for the web app (stops the browser's own zoom → no double-zoom); it is
harmless on desktop. Handle both `=`/`+` (Shift variance) and `-`/`_`. Ignore
repeats-as-needed and non-modifier keys.

**Execution note:** Verify in an actual **desktop build** that `⌘ +/−/0` reach the
webview keydown (the plan's core assumption). If WKWebView swallows them, fall
back to the Risks mitigation (Rust global-shortcut / View menu forwarding into
the webview) — do not silently ship a desktop no-op.

**Patterns to follow:** `useGlobalKeyboard` in `apps/web/components/app/workspace-app.tsx` (listener add/remove, editable-target guard shape).

**Test scenarios:**

- Happy path: dispatch `keydown` `{metaKey:true, key:"="}` → `setZoom` called with `zoomIn(current)` and `preventDefault` called; `{key:"-"}` → `zoomOut`; `{key:"0"}` → `DEFAULT_ZOOM`.
- Edge case: `{ctrlKey:true, key:"+"}` behaves like `⌘ +` (cross-platform); at `ZOOM_MAX`, `⌘ +` keeps `ZOOM_MAX` (via `zoomIn` clamp).
- Error/negative: a bare `"="` (no modifier) does nothing and does **not** call `preventDefault` (leaves normal typing untouched); `⌘ K` / other chords ignored.
- Integration: listener is removed on unmount (no leak / double-fire).

**Verification:** In the web app, `⌘ +/−/0` zoom the UI and the browser's native
zoom does **not** also fire. In the desktop build, the same keys zoom. Level
persists across reload.

---

- [ ] **Unit 4: Discoverability — command palette actions + Settings reset**

**Goal:** Make zoom reachable without the keyboard and satisfy agent-native
parity: Zoom in / out / reset in the command palette, and a zoom row in Settings.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**

- Modify: `apps/web/components/command-palette/palette.tsx` — add `Zoom in`, `Zoom out`, `Reset zoom` `CommandItem`s to the `Actions` group (lucide `ZoomIn` / `ZoomOut` / `Maximize` icons), wired to `useSetZoom` + `useZoom` (+ `zoomIn`/`zoomOut`/`DEFAULT_ZOOM`).
- Modify: `apps/web/components/settings/general-settings.tsx` — a small "Zoom" row showing the current level as a percentage with a **Reset to 100%** button (optionally `−` / `+` controls).
- Test: `apps/web/components/settings/general-settings.test.tsx` (extend); `apps/web/components/command-palette/palette.test.tsx` if present, else a light render test.

**Approach:** Mirror the existing `CommandItem` action pattern (e.g. the "New
card" item). Keep the Settings row read-mostly (current % + reset) so it's a
discoverability aid, not a second control surface competing with the shortcuts.

**Patterns to follow:** `CommandGroup`/`CommandItem` usage in `palette.tsx`;
the `Ticket prefix` section layout in `general-settings.tsx`.

**Test scenarios:**

- Happy path (settings): renders the current zoom as `%` (e.g. `100%`); clicking **Reset** calls the setter with `DEFAULT_ZOOM`.
- Happy path (palette): the three zoom actions render under Actions; selecting `Zoom in` calls the setter with `zoomIn(current)`, `Reset zoom` with `DEFAULT_ZOOM`.
- Edge case (settings): current level display reflects a non-100% value (e.g. `zoom = 1.5` → `150%`).

**Verification:** Command palette lists the three zoom actions and they change
zoom; Settings shows the live level and Reset returns to 100%.

## System-Wide Impact

- **Interaction graph:** New keydown handler on `window` coexists with
  `useGlobalKeyboard` on `document` (the latter bails on modifiers, so no
  conflict) and with the board's `keyboard-nav` (no modifier overlap).
- **Overlays/portals:** Root-level `zoom` scales Radix portals (dialog, popover,
  command palette, sheet) and the card-detail drawer — must be verified, since
  this is the whole point of applying on `<html>` (R2).
- **dnd-kit (`apps/web/components/board/dnd.tsx`):** pointer/rect math under CSS
  `zoom` is the top risk — must verify drag correctness at 75% and 150%.
- **Focus mode:** `:root[data-focus] [data-focus-scope] { filter: saturate() }`
  and `html { zoom }` are independent properties on the root — no conflict
  expected; verify a card still drags/reads correctly with both active.
- **State lifecycle:** two writers of the applied value (inline script from
  cache, React effect from synced meta). Effect must win after hydration and
  keep the cache fresh; last-writer is the synced value.
- **API surface parity:** `setZoom` is a first-class command (catalog) — an agent
  can zoom exactly as the UI does.
- **Unchanged invariants:** `showEmptyColumns` / `ticketPrefix` / theme / focus
  are untouched; zoom is additive board-meta. Absolute-px token scale is
  unchanged (zoom scales it at the page level, not by editing tokens).

## Risks & Dependencies

| Risk                                                                                             | Mitigation                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| dnd-kit pointer coordinates wrong under CSS `zoom` (cards drop in the wrong column at non-100%). | Explicit drag test at 0.75 / 1.5 in both web and desktop. If broken: measure the offset; options are dnd-kit modifiers/`scaleAdjustment`, or falling back to desktop-native `webview.set_zoom` for desktop while keeping CSS zoom for web. Treat as a gating verification for Unit 3.      |
| WebKit (Tauri macOS webview) renders `zoom` differently from Chromium (web).                     | Verify the desktop build at 3 levels including overlays and drag; keep the CSS-var indirection so a per-platform tweak is localized to `applyZoom`/`globals.css`.                                                                                                                          |
| `⌘ +/−/0` do not reach JS keydown in WKWebView (OS/menu swallows them).                          | Verify early (Unit 3 execution note). Fallback: register a Tauri `global-shortcut` (or add a hidden View menu with accelerators) that emits an event the webview listens for and routes to `setZoom` — a Rust addition scoped only to key routing, still driving the same persisted value. |
| Double-zoom in the web browser (native + app).                                                   | `preventDefault` on the zoom chord (Unit 3) — covered by a test asserting `preventDefault` is called.                                                                                                                                                                                      |
| Zoom flash on load before Yjs hydrates.                                                          | No-FOUC inline script applies the cached level pre-paint (Unit 2), mirroring theme/focus.                                                                                                                                                                                                  |
| Syncing one zoom across differently-sized screens feels wrong.                                   | Accepted for v1 (user chose sync). Source-of-truth swap to `localStorage` is a one-line change; noted under Deferred to Separate Tasks.                                                                                                                                                    |

## Documentation / Operational Notes

- Per repo rule §1, this feature ships with a committed unit doc:
  `docs/units/UNIT-15-app-zoom.md` (what changed, the CSS-`zoom` decision, the
  two-layer persistence, the no-Rust rationale + fallback, and the verification
  incl. dnd-at-zoom and dark-mode screenshots at 75/100/150%).
- `docs/design/DESIGN.md` updated in Unit 2 (new `--app-zoom` token, zoom
  behavior, no-transition rule, shortcuts) — required by the same-commit docs hook
  since this is a visual/interaction change.
- No migration/backfill: `zoom` defaults at read time; existing boards are
  unaffected until a user zooms.

## Sources & References

- Preference chain: `packages/sync/src/schema.ts`, `packages/sync/src/board-doc.ts`, `packages/commands/src/commands/board.ts`, `packages/commands/src/catalog.ts`, `apps/web/lib/use-board.ts`.
- No-FOUC display prefs: `apps/web/lib/focus-mode.ts`, `apps/web/app/layout.tsx`.
- App root / keyboard: `apps/web/components/app/workspace-app.tsx`.
- Board / dnd: `apps/web/components/board/board-view.tsx`, `apps/web/components/board/dnd.tsx`, `apps/web/components/board/keyboard-nav.tsx`.
- Desktop shell (no zoom today): `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/tauri.conf.json`.
- Tokens: `packages/ui/src/theme.css`, `apps/web/app/globals.css`; `docs/design/DESIGN.md`.
- Board type: `packages/domain/src/types.ts:86`.
