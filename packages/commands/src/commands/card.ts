import {
  addCard,
  archiveCard as syncArchiveCard,
  getCard as syncGetCard,
  moveCard as syncMoveCard,
  setCardPriority as syncSetPriority,
  setCardSeverity as syncSetSeverity,
  setCardTitle,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const createCard = defineCommand({
  name: "createCard",
  description: "Create a card in a column.",
  input: z.object({
    boardId: z.string(),
    columnId: z.string(),
    title: z.string().min(1),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    const id = addCard(doc, {
      id: input.id,
      columnId: input.columnId,
      title: input.title,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return syncGetCard(doc, id);
  },
});

export const moveCard = defineCommand({
  name: "moveCard",
  description: "Move a card to a column at a position between two neighbor cards.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    toColumnId: z.string(),
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncMoveCard(
      doc,
      input.cardId,
      input.toColumnId,
      { afterId: input.afterId ?? null, beforeId: input.beforeId ?? null },
      ctx.clientId,
      ctx.now(),
    );
    return syncGetCard(doc, input.cardId);
  },
});

export const renameCard = defineCommand({
  name: "renameCard",
  description: "Rename a card.",
  input: z.object({ boardId: z.string(), cardId: z.string(), title: z.string().min(1) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    setCardTitle(doc, input.cardId, input.title, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardPriority = defineCommand({
  name: "setCardPriority",
  description: "Set a card's priority (0 None, 1 Low, 2 Medium, 3 High, 4 Urgent).",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetPriority(doc, input.cardId, input.priority, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardSeverity = defineCommand({
  name: "setCardSeverity",
  description: "Set or clear a card's severity (1=S1 … 4=S4, or null to clear).",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetSeverity(doc, input.cardId, input.severity, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const archiveCard = defineCommand({
  name: "archiveCard",
  description: "Archive a card.",
  input: z.object({ boardId: z.string(), cardId: z.string() }),
  run: (ctx, input) => {
    syncArchiveCard(ctx.getBoardDoc(input.boardId), input.cardId, ctx.now());
    return { id: input.cardId, archived: true };
  },
});

export const getCard = defineCommand({
  name: "getCard",
  description: "Get a card by id.",
  input: z.object({ boardId: z.string(), cardId: z.string() }),
  run: (ctx, input) => syncGetCard(ctx.getBoardDoc(input.boardId), input.cardId),
});
