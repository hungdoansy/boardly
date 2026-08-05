"use client";

import { type Status, STATUS_ORDER, STATUS_VALUES } from "@boardly/domain";
import { useSyncExternalStore } from "react";

// Hidden board columns (UNIT-18): which of the eight fixed status columns the
// board omits. Mirrors `lib/focus-mode.ts` — a module-level store exposed via
// useSyncExternalStore and persisted to localStorage.
//
// This preference is DEVICE-LOCAL by design: how many columns fit is a property
// of the screen, not the account, so a laptop and a desktop may differ. That is
// why it is not synced Yjs board meta like `showEmptyColumns` or `zoom`, and
// consequently why there is no command and no REST/MCP surface for it (the one
// deliberate gap in agent parity — see docs/units/UNIT-18-hide-show-columns.md).
//
// Unlike theme/focus/zoom, nothing here is painted before hydration, so there is
// no `<html>` stamp and no no-FOUC inline script to keep in sync.

export const HIDDEN_COLUMNS_STORAGE_KEY = "boardly-hidden-columns";

const EMPTY: readonly Status[] = Object.freeze([]);

/**
 * Pure: coerce a persisted value into the hidden set. Tolerates absent,
 * malformed, non-array, and unknown members — a status that no longer exists
 * degrades to "not hidden", which errs toward showing more, never less. The
 * result is normalized to `STATUS_ORDER` and de-duplicated so the stored order
 * can never affect rendering.
 */
export function parseHiddenStatuses(raw: string | null): Status[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const known = new Set(parsed.filter((v): v is Status => STATUS_VALUES.includes(v as Status)));
  return STATUS_ORDER.filter((s) => known.has(s));
}

function read(): Status[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return parseHiddenStatuses(localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(hidden: Status[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HIDDEN_COLUMNS_STORAGE_KEY, JSON.stringify(hidden));
  } catch {
    // A full or blocked store must not break the in-memory UI.
  }
}

// The snapshot IS the array, and its identity only changes when the contents
// do — `useSyncExternalStore` re-renders (and in dev, throws a cached-snapshot
// warning) if `getSnapshot` hands back a fresh reference each call.
let snapshot: Status[] = read();
const listeners = new Set<() => void>();

function commit(next: Status[]): void {
  snapshot = next;
  persist(next);
  for (const l of listeners) l();
}

/** Current hidden statuses, in `STATUS_ORDER`. Stable reference between changes. */
export function getHiddenStatuses(): Status[] {
  return snapshot;
}

/** Hide or show one status column. A no-op change leaves the reference untouched. */
export function setColumnHidden(status: Status, hidden: boolean): void {
  const isHidden = snapshot.includes(status);
  if (isHidden === hidden) return;
  commit(
    hidden
      ? STATUS_ORDER.filter((s) => s === status || snapshot.includes(s))
      : snapshot.filter((s) => s !== status),
  );
}

/** Restore every hidden column. The board's escape hatch from an empty board. */
export function showAllColumns(): void {
  if (snapshot.length === 0) {
    // Still persist, so an explicit "show all" clears a stale stored value.
    persist([]);
    return;
  }
  commit([]);
}

export function subscribeHiddenColumns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live hidden statuses, in `STATUS_ORDER`. */
export function useHiddenStatuses(): Status[] {
  return useSyncExternalStore(subscribeHiddenColumns, getHiddenStatuses, () => EMPTY as Status[]);
}
