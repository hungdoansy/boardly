import {
  addLink as syncAddLink,
  getCard as syncGetCard,
  removeLink as syncRemoveLink,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const addLink = defineCommand({
  name: "addLink",
  description:
    "Attach a link to a card. The provider (Slack/Linear/Claude/generic) is auto-detected.",
  input: z.object({
    boardId: z.string(),
    cardId: z.string(),
    url: z.string().min(1),
    id: z.string().optional(),
    title: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    const linkId = syncAddLink(doc, {
      cardId: input.cardId,
      id: input.id,
      url: input.url,
      title: input.title,
      now: ctx.now(),
      clientId: ctx.clientId,
    });
    return { cardId: input.cardId, linkId, card: syncGetCard(doc, input.cardId) };
  },
});

export const removeLink = defineCommand({
  name: "removeLink",
  description: "Remove a link from a card.",
  input: z.object({ boardId: z.string(), cardId: z.string(), linkId: z.string() }),
  run: (ctx, input) => {
    syncRemoveLink(ctx.getBoardDoc(input.boardId), input.cardId, input.linkId, ctx.now());
    return { cardId: input.cardId, linkId: input.linkId };
  },
});
