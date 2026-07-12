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
