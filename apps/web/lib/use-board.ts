"use client";

import type { Card, Column } from "@boardly/domain";
import { addColumn, archiveColumn, execute, renameColumn } from "@boardly/commands";
import { boardColumns, cardsInColumn, liveColumns, reclaimCards } from "@boardly/sync";
import { useY, useYDoc } from "@boardly/sync/react";
import { useCallback } from "react";

import { useBoardlyContext } from "./boardly-context";

/** Live, ord-sorted columns of a board. */
export function useColumns(boardId: string): Column[] {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useY(boardColumns(doc), () => liveColumns(doc), { deep: true });
}

/** Live card count per live column, keyed by column id. Depends on both columns and cards. */
export function useCardCounts(boardId: string): Record<string, number> {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useYDoc(doc, () => {
    const counts: Record<string, number> = {};
    for (const col of liveColumns(doc)) counts[col.id] = cardsInColumn(doc, col.id).length;
    return counts;
  });
}

/** Cards whose column was deleted (surfaced in the "Unsorted" bucket). Depends on columns + cards. */
export function useReclaimedCards(boardId: string): Card[] {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useYDoc(doc, () => reclaimCards(doc));
}

export interface ColumnActions {
  add(title: string): string;
  rename(columnId: string, title: string): void;
  remove(columnId: string): void;
}

export function useColumnActions(boardId: string): ColumnActions {
  const ctx = useBoardlyContext();
  const add = useCallback(
    (title: string) => execute(addColumn, ctx, { boardId, title }).id,
    [ctx, boardId],
  );
  const rename = useCallback(
    (columnId: string, title: string) => {
      execute(renameColumn, ctx, { boardId, columnId, title });
    },
    [ctx, boardId],
  );
  const remove = useCallback(
    (columnId: string) => {
      execute(archiveColumn, ctx, { boardId, columnId });
    },
    [ctx, boardId],
  );
  return { add, rename, remove };
}
