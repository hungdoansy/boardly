// Whole-app zoom (UNIT-15). A single numeric factor scales the entire UI via
// the `--app-zoom` CSS var on <html> (see apps/web). The factor is a synced
// per-user board preference (board meta `zoom`), so the clamp/step math lives
// here in the domain layer where the command (boundary validation) and the UI
// (keyboard stepping) can share one source of truth.

/** No zoom — 100%. The read-time default when board meta has no `zoom`. */
export const DEFAULT_ZOOM = 1;

/** Smallest allowed factor (50%). */
export const ZOOM_MIN = 0.5;

/** Largest allowed factor (200%). */
export const ZOOM_MAX = 2;

/**
 * The discrete zoom levels ⌘+/⌘− step through, ascending. Browser-like spacing:
 * finer near 100%, coarser at the extremes. `DEFAULT_ZOOM` is a member so ⌘0
 * always lands back on an exact step.
 */
export const ZOOM_STEPS: readonly number[] = [
  0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2,
];

// Tolerance so a factor sitting exactly on a step is treated as "on" it (float
// noise from persistence never strands us between steps).
const EPS = 1e-6;

/** Clamp any number to `[ZOOM_MIN, ZOOM_MAX]`; non-finite falls back to default. */
export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_ZOOM;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, factor));
}

/** Next step strictly above `factor` (clamped); `ZOOM_MAX` when already at/above the top. */
export function zoomIn(factor: number): number {
  const current = clampZoom(factor);
  const next = ZOOM_STEPS.find((step) => step > current + EPS);
  return next ?? ZOOM_MAX;
}

/** Previous step strictly below `factor` (clamped); `ZOOM_MIN` when already at/below the bottom. */
export function zoomOut(factor: number): number {
  const current = clampZoom(factor);
  let prev = ZOOM_MIN;
  for (const step of ZOOM_STEPS) {
    if (step < current - EPS) prev = step;
    else break;
  }
  return prev;
}
