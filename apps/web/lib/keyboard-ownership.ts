/**
 * Shared "who owns the keyboard right now" checks for the app's competing
 * keydown handlers (the global shortcuts, the board roving nav, and the leader
 * mechanism). Centralized here so the DOM selectors live in exactly one place
 * instead of being copy-pasted across `workspace-app.tsx` and `hotkeys.ts`.
 */

/**
 * A dnd-kit keyboard drag is currently picking up a card, so the arrow keys
 * belong to it. The guard targets `[data-nav="card"][aria-pressed="true"]`
 * specifically — a bare `aria-pressed` check would false-positive on sidebar
 * toggles (the selected project row and Settings both carry `aria-pressed`).
 */
export function isCardDragActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[data-nav="card"][aria-pressed="true"]') !== null;
}

/** An open Radix dialog / sheet / command-palette owns the keyboard. */
export function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/** Something already owns the keyboard: an open overlay or an active card drag. */
export function keyboardOwnedElsewhere(): boolean {
  return isOverlayOpen() || isCardDragActive();
}
