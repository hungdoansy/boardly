"use client";

import type { ActivityEntry, Card, DueDate, Label, PriorityValue, Status } from "@boardly/domain";
import {
  detectProvider,
  isGithubRepoUrl,
  isSafeHttpUrl,
  LinkProvider,
  STATUS_ORDER,
} from "@boardly/domain";

import { fetchGithubRepoDescription, unfurl } from "./unfurl-client";
import {
  addChecklistItem,
  addLink,
  archiveCard,
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
  renameLabel,
  setBadgeConfig,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardProject,
  setCardStatus,
  setChecklistItemText,
  setShowEmptyColumns,
  setTicketPrefix,
  toggleChecklistItem,
  unassignLabel,
} from "@boardly/commands";
import {
  allLiveCards,
  boardCards,
  boardLabels,
  boardMeta,
  cardActivity,
  cardsInStatus,
  getBoard,
  getCard,
  listLabels,
} from "@boardly/sync";
import { useY, useYDoc } from "@boardly/sync/react";
import { useCallback } from "react";

import { useBoardlyContext } from "./boardly-context";
import { getSelectedProject } from "./use-projects";

/** Live card count per fixed status column, keyed by status. Depends on cards. */
export function useCardCounts(): Record<Status, number> {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(
    boardCards(doc),
    () => {
      const counts = {} as Record<Status, number>;
      for (const status of STATUS_ORDER) counts[status] = cardsInStatus(doc, status).length;
      return counts;
    },
    // Card status is a nested Y.Map field; without deep the counts (and the
    // hide-empty-columns toggle that derives from them) go stale on a move.
    { deep: true },
  );
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

/**
 * Board-toolbar preference: whether empty status columns are shown. Board meta,
 * so it persists per-user and syncs across devices; defaults to true.
 */
export function useShowEmptyColumns(): boolean {
  const ctx = useBoardlyContext();
  const doc = ctx.getBoardDoc();
  return useY(boardMeta(doc), () => getBoard(doc, ctx.userId ?? "").showEmptyColumns);
}

export function useSetShowEmptyColumns(): (show: boolean) => void {
  const ctx = useBoardlyContext();
  return useCallback(
    (show: boolean) => {
      execute(setShowEmptyColumns, ctx, { show });
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

/** Live, ord-sorted, non-archived cards in a fixed status column. */
export function useCardsInStatus(status: Status): Card[] {
  const doc = useBoardlyContext().getBoardDoc();
  return useY(boardCards(doc), () => cardsInStatus(doc, status), { deep: true });
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
  /** Create a card in a status column (a card's column IS its status; defaults to Todo). */
  create(title: string, status?: Status): string;
  rename(cardId: string, title: string): void;
  setDescription(cardId: string, description: string): void;
  setPriority(cardId: string, priority: PriorityValue): void;
  setStatus(cardId: string, status: Status): void;
  setDueDate(cardId: string, dueDate: DueDate | null): void;
  setProject(cardId: string, projectId: string | null): void;
  archive(cardId: string): void;
}

export function useCardActions(): CardActions {
  const ctx = useBoardlyContext();
  const create = useCallback(
    (title: string, status?: Status) => {
      // New cards inherit the sidebar's active project scope (null = no project).
      const projectId = getSelectedProject() ?? undefined;
      return execute(createCard, ctx, { title, status, projectId })?.id ?? "";
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
  const setProject = useCallback(
    (cardId: string, projectId: string | null) => {
      execute(setCardProject, ctx, { cardId, projectId });
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
    setStatus,
    setDueDate,
    setProject,
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
        // already render a good short label, so skip the round-trip for them —
        // except a bare GitHub repo link, which also gets its description
        // fetched (stored in the same `title` field; rendered as a secondary
        // line, not a label replacement — see `linkLabel`/`linkSubtitle`).
        // `isGithubRepoUrl` gates the fetch synchronously so a PR/issue link
        // (the common case) never hits an `await` before `execute` runs.
        let title: string | undefined;
        const provider = detectProvider(url);
        if (provider === LinkProvider.Generic) {
          title = (await unfurl(url))?.title;
        } else if (provider === LinkProvider.GitHub && isGithubRepoUrl(url)) {
          title = await fetchGithubRepoDescription(url);
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

