import { getCard as syncGetCard, setCardStatus as syncSetStatus } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// Values mirror `@boardly/domain`'s Status enum. Unit 2.12 adds categories,
// colors, transitions, and activity logging on top of this command.
const statusInput = z.enum(["backlog", "todo", "in_progress", "in_review", "done", "canceled"]);

export const setCardStatus = defineCommand({
  name: "setCardStatus",
  description: "Set a card's workflow status (independent of its column).",
  input: z.object({ boardId: z.string(), cardId: z.string(), status: statusInput }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc(input.boardId);
    syncSetStatus(doc, input.cardId, input.status, ctx.now());
    return syncGetCard(doc, input.cardId);
  },
});
