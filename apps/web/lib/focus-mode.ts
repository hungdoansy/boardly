"use client";

import { useSyncExternalStore } from "react";

// Focus mode (Unit F1): an appearance-only preference that quiets the board.
// Mirrors `lib/theme.ts` — a module-level store exposed via useSyncExternalStore,
// persisted to localStorage, stamped onto <html> as `data-focus`. It is NOT a
// saved-view lens: it changes how loud cards look, never which cards show.
//   off  — normal (all badges, full color)
//   calm — all badges, color muted (CSS `saturate`, not grayscale)
//   zen  — card face collapses to title + status only (Unit F2)
// A no-FOUC inline script (see app/layout.tsx) stamps the same attribute before
// first paint. Keep the two in sync.
export type FocusLevel = "off" | "calm" | "zen";

export const FOCUS_STORAGE_KEY = "boardly-focus";

const LEVELS: FocusLevel[] = ["off", "calm", "zen"];

/** Pure: the next level in the Off → Calm → Zen → Off cycle. */
export function nextLevel(level: FocusLevel): FocusLevel {
  return LEVELS[(LEVELS.indexOf(level) + 1) % LEVELS.length] ?? "off";
}

/** Pure: coerce a persisted string to a valid level (unknown/absent → "off"). */
export function parseLevel(value: string | null): FocusLevel {
  return value === "calm" || value === "zen" || value === "off" ? value : "off";
}

function readLevel(): FocusLevel {
  if (typeof localStorage === "undefined") return "off";
  return parseLevel(localStorage.getItem(FOCUS_STORAGE_KEY));
}

/** Stamp the level onto <html> as `data-focus` (attribute absent when off). */
export function applyFocus(level: FocusLevel): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (level === "off") el.removeAttribute("data-focus");
  else el.setAttribute("data-focus", level);
}

let level: FocusLevel = readLevel();
const listeners = new Set<() => void>();
let snapshot: { level: FocusLevel } = { level };

/** Set (and persist) the focus level, apply it to <html>, and notify subscribers. */
export function setFocusLevel(next: FocusLevel): void {
  level = next;
  if (typeof localStorage !== "undefined") localStorage.setItem(FOCUS_STORAGE_KEY, next);
  snapshot = { level };
  applyFocus(level);
  for (const l of listeners) l();
}

/** Imperative cycle (Off → Calm → Zen → Off) — safe from a global key handler. */
export function cycleFocus(): void {
  setFocusLevel(nextLevel(level));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const SERVER_SNAPSHOT = { level: "off" as FocusLevel };

export interface UseFocusResult {
  level: FocusLevel;
  setLevel: (level: FocusLevel) => void;
  /** Advance Off → Calm → Zen → Off. */
  cycle: () => void;
}

export function useFocusMode(): UseFocusResult {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => SERVER_SNAPSHOT,
  );
  return {
    level: state.level,
    setLevel: setFocusLevel,
    cycle: () => setFocusLevel(nextLevel(state.level)),
  };
}
