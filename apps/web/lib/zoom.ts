"use client";

// Whole-app zoom apply/cache (UNIT-15). The synced source of truth is board
// meta `zoom` (see `useZoom`/`setZoom`); this module is the *device* layer:
// it applies a factor to the live DOM and mirrors it to localStorage so a
// no-FOUC inline script (see `app/layout.tsx`) can restore the last level
// before first paint — the same shape as `lib/theme.ts` / `lib/focus-mode.ts`.
//
// The apply step has two levers, chosen by platform in `applyZoom` (see below):
// on the web, a single CSS var on <html> (`html { zoom: var(--app-zoom, 1) }`,
// see `app/globals.css`) — applied at the document root so body-portaled
// overlays (dialogs, popovers, command palette, card-detail drawer) scale too;
// on desktop (Tauri), the native webview zoom, which the CSS lever can't match
// for window-fill. Either way `zoom` reflows (more cards fit) and scales the
// absolute-px type scale, which a base font-size change could not (px, not rem).

import { clampZoom, DEFAULT_ZOOM } from "@boardly/domain";

import { isTauri } from "./platform";

export const ZOOM_STORAGE_KEY = "boardly-zoom";

// Monotonic token so overlapping `applyZoom` calls settle deterministically.
// The desktop branch is async (dynamic import + native `setZoom`), so a rapid
// ⌘+/⌘− burst can have an earlier call's promise resolve *after* a later one;
// each call captures its `gen` and no-ops its async tail once superseded, so the
// last-requested factor always wins (no stale native zoom, no stacked fallback).
let applyGen = 0;

// Resolve the Tauri webview module once and reuse the promise. A burst of zoom
// changes then shares a single import (no re-import per step, and concurrent
// calls can't race to distinct module instances).
let webviewModulePromise: Promise<typeof import("@tauri-apps/api/webview")> | null = null;
function loadTauriWebview(): Promise<typeof import("@tauri-apps/api/webview")> {
  return (webviewModulePromise ??= import("@tauri-apps/api/webview"));
}

/**
 * Apply a zoom factor to the running app.
 *
 * Two engines, two levers (UNIT-15):
 * - **Desktop (Tauri):** drive the *native* webview zoom (`webview.setZoom`).
 *   The engine rescales the layout viewport itself, so it reflows and fills the
 *   window with no CSS gutter/overflow — the thing CSS `zoom` can't do
 *   cross-engine. We keep `--app-zoom` pinned to 1 so the web CSS rules stay
 *   inert. `setZoom` is async and requires the `core:webview:allow-set-webview-zoom`
 *   capability; the dynamic import keeps the Tauri API out of the web bundle path.
 * - **Web (Chromium/Firefox):** stamp `--app-zoom` on <html>; `globals.css`
 *   turns it into `html { zoom: var(--app-zoom, 1) }`. This is standard
 *   content-zoom — it can leave a gutter on zoom-out / scroll on zoom-in (an
 *   accepted web-fallback limitation; the desktop native path is the correct
 *   fill). There is no body-size compensation.
 */
export function applyZoom(factor: number): void {
  if (typeof document === "undefined") return;
  const z = clampZoom(factor);
  const gen = ++applyGen;
  if (isTauri()) {
    // Keep the CSS lever off; the native webview zoom does the scaling.
    document.documentElement.style.setProperty("--app-zoom", "1");
    void loadTauriWebview()
      .then(({ getCurrentWebview }) => {
        if (gen !== applyGen) return; // a newer applyZoom superseded this one
        return getCurrentWebview().setZoom(z);
      })
      .catch((err: unknown) => {
        if (gen !== applyGen) return; // superseded — don't clobber newer state
        // Native call unavailable/failed — fall back to the CSS lever so zoom
        // still does *something*. Surface the cause in dev; silent in prod.
        if (process.env.NODE_ENV !== "production") {
          console.warn("applyZoom: native webview zoom failed; using CSS fallback", err);
        }
        document.documentElement.style.setProperty("--app-zoom", String(z));
      });
    return;
  }
  document.documentElement.style.setProperty("--app-zoom", String(z));
}

/** Coerce a persisted string to a valid factor (unknown/absent/garbage → default). */
export function parseZoom(value: string | null): number {
  if (value === null) return DEFAULT_ZOOM;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? clampZoom(n) : DEFAULT_ZOOM;
}

/** Read the device-cached factor from localStorage (default when unavailable). */
export function readCachedZoom(): number {
  if (typeof localStorage === "undefined") return DEFAULT_ZOOM;
  return parseZoom(localStorage.getItem(ZOOM_STORAGE_KEY));
}

/** Mirror the factor to localStorage so the pre-paint script can restore it. */
export function cacheZoom(factor: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ZOOM_STORAGE_KEY, String(clampZoom(factor)));
}
