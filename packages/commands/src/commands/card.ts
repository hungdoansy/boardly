import { type Status, STATUS_VALUES } from "@boardly/domain";
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
  setCardTitle,
  setChecklistItemText as syncSetChecklistItemText,
  toggleChecklistItem as syncToggleChecklistItem,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// Enum derived from the domain Status values so the agent surface can't drift.
// A card's status IS its column, so creating/moving a card places it by status.
const statusInput = z.enum(STATUS_VALUES as [Status, ...Status[]]);

export const createCard = defineCommand({
  name: "createCard",
  description: "Create a card in a status column (defaults to Todo).",
  input: z.object({
    status: statusInput.optional(),
    title: z.string().min(1),
    projectId: z.string().optional(),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    const id = addCard(doc, {
      id: input.id,
      status: input.status,
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
  description:
    "Move a card to a status column at a position between two neighbor cards (drag path: applies the status and slots the card).",
  input: z.object({
    cardId: z.string(),
    toStatus: statusInput,
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncMoveCard(
      doc,
      input.cardId,
      input.toStatus,
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
  input: z.object({ cardId: z.string(), title: z.string().min(1) }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    setCardTitle(doc, input.cardId, input.title, ctx.now(), ctx.userId ?? ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardPriority = defineCommand({
  name: "setCardPriority",
  description: "Set a card's priority (0 None, 1 Low, 2 Medium, 3 High, 4 Urgent).",
  input: z.object({
    cardId: z.string(),
    priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetPriority(doc, input.cardId, input.priority, ctx.now(), ctx.userId ?? ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardDescription = defineCommand({
  name: "setCardDescription",
  description: "Set a card's markdown description (character-level merge-safe).",
  input: z.object({ cardId: z.string(), description: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetDescription(doc, input.cardId, input.description, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardDueDate = defineCommand({
  name: "setCardDueDate",
  description: "Set or clear a card's due date. `at` is epoch ms; pass null to clear.",
  input: z.object({
    cardId: z.string(),
    dueDate: z.object({ at: z.number(), hasTime: z.boolean() }).nullable(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetDueDate(doc, input.cardId, input.dueDate, ctx.now(), ctx.userId ?? ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const addChecklistItem = defineCommand({
  name: "addChecklistItem",
  description: "Add a checklist item to a card.",
  input: z.object({
    cardId: z.string(),
    text: z.string().min(1),
    id: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
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
  input: z.object({ cardId: z.string(), itemId: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncToggleChecklistItem(doc, input.cardId, input.itemId, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const setChecklistItemText = defineCommand({
  name: "setChecklistItemText",
  description: "Edit a checklist item's text.",
  input: z.object({
    cardId: z.string(),
    itemId: z.string(),
    text: z.string().min(1),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetChecklistItemText(doc, input.cardId, input.itemId, input.text, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const deleteChecklistItem = defineCommand({
  name: "deleteChecklistItem",
  description: "Delete a checklist item from a card.",
  input: z.object({ cardId: z.string(), itemId: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncDeleteChecklistItem(doc, input.cardId, input.itemId, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});

export const moveChecklistItem = defineCommand({
  name: "moveChecklistItem",
  description: "Reorder a checklist item between neighbors.",
  input: z.object({
    cardId: z.string(),
    itemId: z.string(),
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
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
  input: z.object({ cardId: z.string() }),
  run: (ctx, input) => {
    syncArchiveCard(
      ctx.getBoardDoc(),
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
  input: z.object({ cardId: z.string() }),
  run: (ctx, input) => syncGetCard(ctx.getBoardDoc(), input.cardId),
});
