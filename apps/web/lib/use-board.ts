"use client";

import type {
  ActivityEntry,
  Card,
  Column,
  DueDate,
  Label,
  PriorityValue,
  SeverityValue,
  Status,
} from "@boardly/domain";
import { detectProvider, isSafeHttpUrl, LinkProvider } from "@boardly/domain";

import { unfurl } from "./unfurl-client";
import {
  addChecklistItem,
  addColumn,
  addLink,
  archiveCard,
  archiveColumn,
  assignLabel,
  createCard,
  createLabel,
  deleteChecklistItem,
  deleteLabel,
  execute,
  moveChecklistItem,
  moveLink,
  recolorLabel,
  removeLink,
  renameCard,
  renameColumn,
  setColumnWipLimit,
  renameLabel,
  setBadgeConfig,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  setCardStatus,
  setChecklistItemText,
  setTicketPrefix,
  toggleChecklistItem,
  unassignLabel,
} from "@boardly/commands";
import {
  allLiveCards,
  boardCards,
  boardColumns,
  boardLabels,
  boardMeta,
  cardActivity,
  cardsInColumn,
  getBoard,
  getCard,
  listLabels,
  liveColumns,
  reclaimCards,
} from "@boardly/sync";
import { useY, useYDoc } from "@boardly/sync/react";
import { useCallback } from "react";

import { useBoardlyContext } from "./boardly-context";
import { getSelectedProject } from "./use-projects";

/** Live, ord-sorted columns of the board. */
export function useColumns(): Column[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardColumns(doc), () => liveColumns(doc), { deep: true });
}

/** Live card count per live column, keyed by column id. Depends on both columns and cards. */
export function useCardCounts(): Record<string, number> {
  const doc = useBoardlyContext().getBoardDoc();
  return useYDoc(doc, () => {
    const counts: Record<string, number> = {};
    for (const col of liveColumns(doc)) counts[col.id] = cardsInColumn(doc, col.id).length;
    return counts;
  });
}

/** Live ordered card-face badge config for the board. */
export function useBadgeConfig(): string[] {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc();
  return useY(boardMeta(doc), () => getBoard(doc, ctx.userId ?? "").badgeConfig, {
    isEqual: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]),
  });
}

export function useSetBadgeConfig(): (config: string[]) => void {
  const ctx = useBoardlyContext();
  return useCallback(
    (config: string[]) => {
      execute(setBadgeConfig, ctx, { config });
    },
    [ctx],
  );
}

/** Live board title (per-user board). Empty until the board is seeded. */
export function useBoardTitle(): string {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc();
  return useY(boardMeta(doc), () => getBoard(doc, ctx.userId ?? "").title);
}

/** Live board ticket prefix (display-only; empty renders ids as #123). */
export function useTicketPrefix(): string {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc();
  return useY(boardMeta(doc), () => getBoard(doc, ctx.userId ?? "").shortIdPrefix);
}

export function useSetTicketPrefix(): (prefix: string) => void {
  const ctx = useBoardlyContext();
  return useCallback(
    (prefix: string) => {
      execute(setTicketPrefix, ctx, { prefix });
    },
    [ctx],
  );
}

/** Live board label palette, sorted by ord. */
export function useLabels(): Label[] {
  const doc = useBoardlyContext().getBoardDoc();
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

export function useLabelActions(): LabelActions {
  const ctx = useBoardlyContext();
  return {
    create: useCallback(
      (name: string, color: string) => execute(createLabel, ctx, { name, color })?.id ?? "",
      [ctx],
    ),
    rename: useCallback(
      (labelId: string, name: string) => {
        execute(renameLabel, ctx, { labelId, name });
      },
      [ctx],
    ),
    recolor: useCallback(
      (labelId: string, color: string) => {
        execute(recolorLabel, ctx, { labelId, color });
      },
      [ctx],
    ),
    remove: useCallback(
      (labelId: string) => {
        execute(deleteLabel, ctx, { labelId });
      },
      [ctx],
    ),
    assign: useCallback(
      (cardId: string, labelId: string) => {
        execute(assignLabel, ctx, { cardId, labelId });
      },
      [ctx],
    ),
    unassign: useCallback(
      (cardId: string, labelId: string) => {
        execute(unassignLabel, ctx, { cardId, labelId });
      },
      [ctx],
    ),
  };
}

/** Cards whose column was deleted (surfaced in the "Unsorted" bucket). Depends on columns + cards. */
export function useReclaimedCards(): Card[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useYDoc(doc, () => reclaimCards(doc));
}

export interface ColumnActions {
  add(title: string): string;
  rename(columnId: string, title: string): void;
  setWipLimit(columnId: string, wipLimit: number | null): void;
  remove(columnId: string): void;
}

/** Live, ord-sorted, non-archived cards in a column. */
export function useCardsInColumn(columnId: string): Card[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardCards(doc), () => cardsInColumn(doc, columnId), { deep: true });
}

/** All non-archived cards on the board (for swimlane grouping, Unit 4.2). */
export function useAllCards(): Card[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardCards(doc), () => allLiveCards(doc), { deep: true });
}

/** A single live card by id (or null). Doc-level subscription (description is a nested Y.Text). */
export function useCardById(cardId: string | null): Card | null {
  const doc = useBoardlyContext().getBoardDoc();
  return useYDoc(doc, () => (cardId ? getCard(doc, cardId) : null), { deps: [cardId] });
}

/** A card's activity timeline, newest-first (Unit 4.3). Empty when no card. */
export function useCardActivity(cardId: string | null): ActivityEntry[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useYDoc(doc, () => (cardId ? cardActivity(doc, cardId) : []), { deps: [cardId] });
}

export interface CardActions {
  create(columnId: string, title: string): string;
  rename(cardId: string, title: string): void;
  setDescription(cardId: string, description: string): void;
  setPriority(cardId: string, priority: PriorityValue): void;
  setSeverity(cardId: string, severity: SeverityValue | null): void;
  setStatus(cardId: string, status: Status): void;
  setDueDate(cardId: string, dueDate: DueDate | null): void;
  archive(cardId: string): void;
}

export function useCardActions(): CardActions {
  const ctx = useBoardlyContext();
  const create = useCallback(
    (columnId: string, title: string) => {
      // New cards inherit the sidebar's active project scope (null = no project).
      const projectId = getSelectedProject() ?? undefined;
      return execute(createCard, ctx, { columnId, title, projectId })?.id ?? "";
    },
    [ctx],
  );
  const rename = useCallback(
    (cardId: string, title: string) => {
      execute(renameCard, ctx, { cardId, title });
    },
    [ctx],
  );
  const setDescription = useCallback(
    (cardId: string, description: string) => {
      execute(setCardDescription, ctx, { cardId, description });
    },
    [ctx],
  );
  const setPriority = useCallback(
    (cardId: string, priority: PriorityValue) => {
      execute(setCardPriority, ctx, { cardId, priority });
    },
    [ctx],
  );
  const setSeverity = useCallback(
    (cardId: string, severity: SeverityValue | null) => {
      execute(setCardSeverity, ctx, { cardId, severity });
    },
    [ctx],
  );
  const setStatus = useCallback(
    (cardId: string, status: Status) => {
      execute(setCardStatus, ctx, { cardId, status });
    },
    [ctx],
  );
  const setDueDate = useCallback(
    (cardId: string, dueDate: DueDate | null) => {
      execute(setCardDueDate, ctx, { cardId, dueDate });
    },
    [ctx],
  );
  const archive = useCallback(
    (cardId: string) => {
      execute(archiveCard, ctx, { cardId });
    },
    [ctx],
  );
  return {
    create,
    rename,
    setDescription,
    setPriority,
    setSeverity,
    setStatus,
    setDueDate,
    archive,
  };
}

export interface ChecklistActions {
  add(cardId: string, text: string): void;
  toggle(cardId: string, itemId: string): void;
  setText(cardId: string, itemId: string, text: string): void;
  remove(cardId: string, itemId: string): void;
  move(
    cardId: string,
    itemId: string,
    neighbors: { afterId?: string | null; beforeId?: string | null },
  ): void;
}

export function useChecklistActions(): ChecklistActions {
  const ctx = useBoardlyContext();
  return {
    add: useCallback(
      (cardId: string, text: string) => {
        execute(addChecklistItem, ctx, { cardId, text });
      },
      [ctx],
    ),
    toggle: useCallback(
      (cardId: string, itemId: string) => {
        execute(toggleChecklistItem, ctx, { cardId, itemId });
      },
      [ctx],
    ),
    setText: useCallback(
      (cardId: string, itemId: string, text: string) => {
        execute(setChecklistItemText, ctx, { cardId, itemId, text });
      },
      [ctx],
    ),
    remove: useCallback(
      (cardId: string, itemId: string) => {
        execute(deleteChecklistItem, ctx, { cardId, itemId });
      },
      [ctx],
    ),
    move: useCallback(
      (
        cardId: string,
        itemId: string,
        neighbors: { afterId?: string | null; beforeId?: string | null },
      ) => {
        execute(moveChecklistItem, ctx, {
          cardId,
          itemId,
          afterId: neighbors.afterId ?? null,
          beforeId: neighbors.beforeId ?? null,
        });
      },
      [ctx],
    ),
  };
}

export interface LinkActions {
  add(cardId: string, url: string): Promise<void>;
  remove(cardId: string, linkId: string): void;
  move(cardId: string, linkId: string, neighbors: { afterId?: string | null; beforeId?: string | null }): void;
}

export function useLinkActions(): LinkActions {
  const ctx = useBoardlyContext();
  return {
    add: useCallback(
      async (cardId: string, url: string) => {
        if (!isSafeHttpUrl(url)) return; // command also rejects; skip here to avoid a throw
        // Generic links get a server-fetched title (Unit 3.7); known providers
        // already render a good short label, so skip the round-trip for them.
        let title: string | undefined;
        if (detectProvider(url) === LinkProvider.Generic) {
          title = (await unfurl(url))?.title;
        }
        execute(addLink, ctx, { cardId, url, title });
      },
      [ctx],
    ),
    remove: useCallback(
      (cardId: string, linkId: string) => {
        execute(removeLink, ctx, { cardId, linkId });
      },
      [ctx],
    ),
    move: useCallback(
      (cardId, linkId, neighbors) => {
        execute(moveLink, ctx, {
          cardId,
          linkId,
          afterId: neighbors.afterId ?? null,
          beforeId: neighbors.beforeId ?? null,
        });
      },
      [ctx],
    ),
  };
}

export function useColumnActions(): ColumnActions {
  const ctx = useBoardlyContext();
  const add = useCallback((title: string) => execute(addColumn, ctx, { title }).id, [ctx]);
  const rename = useCallback(
    (columnId: string, title: string) => {
      execute(renameColumn, ctx, { columnId, title });
    },
    [ctx],
  );
  const setWipLimit = useCallback(
    (columnId: string, wipLimit: number | null) => {
      execute(setColumnWipLimit, ctx, { columnId, wipLimit });
    },
    [ctx],
  );
  const remove = useCallback(
    (columnId: string) => {
      execute(archiveColumn, ctx, { columnId });
    },
    [ctx],
  );
  return { add, rename, setWipLimit, remove };
}
