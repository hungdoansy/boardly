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

export const ZOOM_STORAGE_KEY = "boardly-zoom";

/** Stamp the factor onto <html> as the `--app-zoom` CSS var (client-only). */
export function applyZoom(factor: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--app-zoom", String(clampZoom(factor)));
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
