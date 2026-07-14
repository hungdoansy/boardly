import { isSafeHttpUrl } from "@boardly/domain";
import {
  addLink as syncAddLink,
  getCard as syncGetCard,
  moveLink as syncMoveLink,
  removeLink as syncRemoveLink,
  setLinkTitle as syncSetLinkTitle,
} from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

export const addLink = defineCommand({
  name: "addLink",
  description:
    "Attach a link to a card. The provider (Slack/Linear/Claude/generic) is auto-detected.",
  input: z.object({
    cardId: z.string(),
    url: z.string().min(1).refine(isSafeHttpUrl, "URL must be http(s)"),
    id: z.string().optional(),
    title: z.string().optional(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
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
  input: z.object({ cardId: z.string(), linkId: z.string() }),
  run: (ctx, input) => {
    syncRemoveLink(ctx.getBoardDoc(), input.cardId, input.linkId, ctx.now());
    return { cardId: input.cardId, linkId: input.linkId };
  },
});

export const updateLinkTitle = defineCommand({
  name: "updateLinkTitle",
  description:
    "Set a link's display title (e.g. to enrich a generic link after its page title is fetched).",
  input: z.object({
    cardId: z.string(),
    linkId: z.string(),
    title: z.string().min(1),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetLinkTitle(doc, input.cardId, input.linkId, input.title, ctx.now());
    return { cardId: input.cardId, linkId: input.linkId, card: syncGetCard(doc, input.cardId) };
  },
});

export const moveLink = defineCommand({
  name: "moveLink",
  description: "Reorder a link on a card to a position between two neighbor links.",
  input: z.object({
    cardId: z.string(),
    linkId: z.string(),
    afterId: z.string().nullish(),
    beforeId: z.string().nullish(),
  }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncMoveLink(
      doc,
      input.cardId,
      input.linkId,
      { afterId: input.afterId ?? null, beforeId: input.beforeId ?? null },
      ctx.clientId,
      ctx.now(),
    );
    return { cardId: input.cardId, linkId: input.linkId, card: syncGetCard(doc, input.cardId) };
  },
});
