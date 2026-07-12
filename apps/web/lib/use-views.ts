"use client";

import type { SavedView } from "@boardly/domain";
import { deleteView, execute, saveView } from "@boardly/commands";
import { listViews } from "@boardly/sync";
import { useYDoc } from "@boardly/sync/react";
import { useCallback } from "react";

import { useBoardlyContext } from "./boardly-context";

/** Live list of the board's saved views. */
export function useSavedViews(): SavedView[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useYDoc(doc, () => listViews(doc));
}

export interface ViewActions {
  save(view: SavedView): void;
  remove(viewId: string): void;
}

export function useViewActions(): ViewActions {
  const ctx = useBoardlyContext();
  return {
    save: useCallback((view: SavedView) => void execute(saveView, ctx, { view }), [ctx]),
    remove: useCallback((viewId: string) => void execute(deleteView, ctx, { viewId }), [ctx]),
  };
}
