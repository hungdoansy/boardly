import {
  addCard,
  addChecklistItem as syncAddChecklistItem,
  archiveCard as syncArchiveCard,
  deleteChecklistItem as syncDeleteChecklistItem,
  getCard as syncGetCard,
  moveCard as syncMoveCard,
  moveChecklistItem as syncMoveChecklistItem,
  setCardDescription as syncSetDescription,
  setCardDueDate as syncSetDueDate,
  setCardPriority as syncSetPriority,
  setCardSeverity as syncSetSeverity,
  setCardTitle,
  setChecklistItemText as syncSetChecklistItemText,
  toggleChecklistItem as syncToggleChecklistItem,
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
    projectId: z.string().optional(),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    const id = addCard(doc, {
      id: input.id,
      columnId: input.columnId,
      title: input.title,
      projectId: input.projectId,
      now: ctx.now(),
      clientId: ctx.clientId,
      createdBy: ctx.userId,
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
      ctx.userId ?? ctx.clientId,
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
    setCardTitle(doc, input.cardId, input.title, ctx.now(), ctx.userId ?? ctx.clientId);
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
    syncSetPriority(doc, input.cardId, input.priority, ctx.now(), ctx.userId ?? ctx.clientId);
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
    syncSetSeverity(doc, input.cardId, input.severity, ctx.now(), ctx.userId ?? ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardDescription = defineCommand({
  name: "setCardDescription",
  description: "Set a card's markdown description (character-level merge-safe).",
  input: z.object({ boardId: z.string(), cardId: z.string(), description: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetDescription(doc, input.cardId, input.description, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardDueDate = defineCommand({
  name: "setCardDueDate",
  description: "Set or clear a card's due date. `at` is epoch ms; pass null to clear.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    dueDate: z.object({ at: z.number(), hasTime: z.boolean() }).nullable(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetDueDate(doc, input.cardId, input.dueDate, ctx.now(), ctx.userId ?? ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const addChecklistItem = defineCommand({
  name: "addChecklistItem",
  description: "Add a checklist item to a card.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    text: z.string().min(1),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncAddChecklistItem(doc, {
      cardId: input.cardId,
      id: input.id,
      text: input.text,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return syncGetCard(doc, input.cardId);
  },
});

export const toggleChecklistItem = defineCommand({
  name: "toggleChecklistItem",
  description: "Toggle a checklist item's done state.",
  input: z.object({ boardId: z.string(), cardId: z.string(), itemId: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncToggleChecklistItem(doc, input.cardId, input.itemId, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setChecklistItemText = defineCommand({
  name: "setChecklistItemText",
  description: "Edit a checklist item's text.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    itemId: z.string(),
    text: z.string().min(1),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetChecklistItemText(doc, input.cardId, input.itemId, input.text, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const deleteChecklistItem = defineCommand({
  name: "deleteChecklistItem",
  description: "Delete a checklist item from a card.",
  input: z.object({ boardId: z.string(), cardId: z.string(), itemId: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncDeleteChecklistItem(doc, input.cardId, input.itemId, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const moveChecklistItem = defineCommand({
  name: "moveChecklistItem",
  description: "Reorder a checklist item between neighbors.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    itemId: z.string(),
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncMoveChecklistItem(
      doc,
      input.cardId,
      input.itemId,
      { afterId: input.afterId ?? null, beforeId: input.beforeId ?? null },
      ctx.clientId,
      ctx.now(),
    );
    return syncGetCard(doc, input.cardId);
  },
});

export const archiveCard = defineCommand({
  name: "archiveCard",
  description: "Archive a card.",
  input: z.object({ boardId: z.string(), cardId: z.string() }),
  run: (ctx, input) => {
    syncArchiveCard(
      ctx.getBoardDoc(input.boardId),
      input.cardId,
      ctx.now(),
      ctx.userId ?? ctx.clientId,
    );
    return { id: input.cardId, archived: true };
  },
});

export const getCard = defineCommand({
  name: "getCard",
  description: "Get a card by id.",
  input: z.object({ boardId: z.string(), cardId: z.string() }),
  run: (ctx, input) => syncGetCard(ctx.getBoardDoc(input.boardId), input.cardId),
});
