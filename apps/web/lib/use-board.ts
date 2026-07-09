"use client";

import type { Card, Column, Label } from "@boardly/domain";
import {
  addColumn,
  archiveCard,
  archiveColumn,
  assignLabel,
  createCard,
  createLabel,
  deleteLabel,
  execute,
  recolorLabel,
  renameCard,
  renameColumn,
  renameLabel,
  setCardDescription,
  unassignLabel,
} from "@boardly/commands";
import {
  boardCards,
  boardColumns,
  boardLabels,
  cardsInColumn,
  getCard,
  listLabels,
  liveColumns,
  reclaimCards,
} from "@boardly/sync";
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

/** Live board label palette, sorted by ord. */
export function useLabels(boardId: string): Label[] {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useY(boardLabels(doc), () => listLabels(doc), { deep: true });
}

export interface LabelActions {
  create(name: string, color: string): string;
  rename(labelId: string, name: string): void;
  recolor(labelId: string, color: string): void;
  remove(labelId: string): void;
  assign(cardId: string, labelId: string): void;
  unassign(cardId: string, labelId: string): void;
}

export function useLabelActions(boardId: string): LabelActions {
  const ctx = useBoardlyContext();
  return {
    create: useCallback(
      (name: string, color: string) =>
        execute(createLabel, ctx, { boardId, name, color })?.id ?? "",
      [ctx, boardId],
    ),
    rename: useCallback(
      (labelId: string, name: string) => {
        execute(renameLabel, ctx, { boardId, labelId, name });
      },
      [ctx, boardId],
    ),
    recolor: useCallback(
      (labelId: string, color: string) => {
        execute(recolorLabel, ctx, { boardId, labelId, color });
      },
      [ctx, boardId],
    ),
    remove: useCallback(
      (labelId: string) => {
        execute(deleteLabel, ctx, { boardId, labelId });
      },
      [ctx, boardId],
    ),
    assign: useCallback(
      (cardId: string, labelId: string) => {
        execute(assignLabel, ctx, { boardId, cardId, labelId });
      },
      [ctx, boardId],
    ),
    unassign: useCallback(
      (cardId: string, labelId: string) => {
        execute(unassignLabel, ctx, { boardId, cardId, labelId });
      },
      [ctx, boardId],
    ),
  };
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

/** Live, ord-sorted, non-archived cards in a column. */
export function useCardsInColumn(boardId: string, columnId: string): Card[] {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useY(boardCards(doc), () => cardsInColumn(doc, columnId), { deep: true });
}

/** A single live card by id (or null). Doc-level subscription (description is a nested Y.Text). */
export function useCardById(boardId: string, cardId: string | null): Card | null {
  const doc = useBoardlyContext().getBoardDoc(boardId);
  return useYDoc(doc, () => (cardId ? getCard(doc, cardId) : null), { deps: [cardId] });
}

export interface CardActions {
  create(columnId: string, title: string): string;
  rename(cardId: string, title: string): void;
  setDescription(cardId: string, description: string): void;
  archive(cardId: string): void;
}

export function useCardActions(boardId: string): CardActions {
  const ctx = useBoardlyContext();
  const create = useCallback(
    (columnId: string, title: string) =>
      execute(createCard, ctx, { boardId, columnId, title })?.id ?? "",
    [ctx, boardId],
  );
  const rename = useCallback(
    (cardId: string, title: string) => {
      execute(renameCard, ctx, { boardId, cardId, title });
    },
    [ctx, boardId],
  );
  const setDescription = useCallback(
    (cardId: string, description: string) => {
      execute(setCardDescription, ctx, { boardId, cardId, description });
    },
    [ctx, boardId],
  );
  const archive = useCallback(
    (cardId: string) => {
      execute(archiveCard, ctx, { boardId, cardId });
    },
    [ctx, boardId],
  );
  return { create, rename, setDescription, archive };
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
