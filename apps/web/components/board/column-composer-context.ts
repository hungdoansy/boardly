"use client";

import { createContext, useContext } from "react";

export interface ColumnComposerValue {
  /** Whether the column's inline add-card composer is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Per-column bridge so the column header's "+" (rendered by `BoardColumn`) can
 * open the inline add-card composer (rendered by `ColumnCards`, a sibling
 * subtree passed as `children`). `null` when no provider is present, so
 * `CardComposer` falls back to its own internal open-state and stays reusable
 * and unit-testable standalone.
 */
export const ColumnComposerContext = createContext<ColumnComposerValue | null>(null);

export function useColumnComposer(): ColumnComposerValue | null {
  return useContext(ColumnComposerContext);
}
