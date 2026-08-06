import { type Status, STATUS_VALUES } from "@boardly/domain";
import { getCard as syncGetCard, setCardStatus as syncSetStatus } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// Enum derived from the domain Status values so the agent surface can't drift.
const statusInput = z.enum(STATUS_VALUES as [Status, ...Status[]]);

export const setCardStatus = defineCommand({
  name: "setCardStatus",
  description: "Set a card's workflow status (independent of its column).",
  input: z.object({ cardId: z.string(), status: statusInput }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    syncSetStatus(doc, input.cardId, input.status, ctx.now(), ctx.clientId);
    return syncGetCard(doc, input.cardId);
  },
});

export const setCardsStatus = defineCommand({
  name: "setCardsStatus",
  description:
    "Set the status of multiple cards at once (e.g. mark every visible card in a column done). Ids that don't exist, or cards already at that status, are ignored.",
  input: z.object({ cardIds: z.array(z.string()), status: statusInput }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    const now = ctx.now();
    // Report only the cards this actually moved: `syncSetStatus` no-ops when the
    // status is unchanged, so counting every supplied id would overstate the
    // effect (and the activity log would disagree).
    const updatedIds: string[] = [];
    for (const cardId of input.cardIds) {
      const card = syncGetCard(doc, cardId);
      if (!card || card.status === input.status) continue;
      syncSetStatus(doc, cardId, input.status, now, ctx.clientId);
      updatedIds.push(cardId);
    }
    return { updatedIds, count: updatedIds.length };
  },
});
