import { allLiveCards } from "@boardly/sync";
import { z } from "zod";

import { defineCommand } from "../command";

// Substring search over the board's live cards. Ranked fuzzy search across all
// boards is Unit 2.11; this is the command-layer surface it will build on.
// Placement is by status now (a card's column IS its status), so results carry
// `status` as the grouping field.
export const searchCards = defineCommand({
  name: "searchCards",
  description: "Search a board's cards by title or short id (substring, case-insensitive).",
  input: z.object({ query: z.string() }),
  run: (ctx, input) => {
    const doc = ctx.getBoardDoc();
    const all = allLiveCards(doc);
    const q = input.query.trim().toLowerCase();
    const matches =
      q === ""
        ? all
        : all.filter(
            (c) => c.title.toLowerCase().includes(q) || c.shortId.toLowerCase().includes(q),
          );
    return matches.map((c) => ({
      id: c.id,
      shortId: c.shortId,
      title: c.title,
      status: c.status,
    }));
  },
});
