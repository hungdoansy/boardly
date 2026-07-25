"use client";

// Whole-app zoom apply/cache (UNIT-15). The synced source of truth is board
// meta `zoom` (see `useZoom`/`setZoom`); this module is the *device* layer:
// it applies a factor to the live DOM and mirrors it to localStorage so a
// no-FOUC inline script (see `app/layout.tsx`) can restore the last level
// before first paint — the same shape as `lib/theme.ts` / `lib/focus-mode.ts`.
//
// The lever is a single CSS var on <html>: `html { zoom: var(--app-zoom, 1) }`
// (see `app/globals.css`). Applying on the document root — not an inner
// wrapper — guarantees body-portaled overlays (dialogs, popovers, the command
// palette, the card-detail drawer) scale with everything else. `zoom` reflows
// (more cards fit) and scales the absolute-px type scale, which a base
// font-size change could not (the tokens are px, not rem).

import { clampZoom, DEFAULT_ZOOM } from "@boardly/domain";

import { isTauri } from "./platform";

export const ZOOM_STORAGE_KEY = "boardly-zoom";

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
 *   turns it into `html { zoom }` + a `100% / zoom` body compensation so the
 *   shell still fills the window.
 */
export function applyZoom(factor: number): void {
  if (typeof document === "undefined") return;
  const z = clampZoom(factor);
  if (isTauri()) {
    // Keep the CSS lever off; the native webview zoom does the scaling.
    document.documentElement.style.setProperty("--app-zoom", "1");
    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) => getCurrentWebview().setZoom(z))
      .catch(() => {
        // If the native call is unavailable, fall back to the CSS lever so zoom
        // still does *something* rather than silently no-op.
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
