import { getCard, initBoard } from "@boardly/sync";
import { describe, expect, it } from "vitest";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { createCard } from "./card";
import { addLink, removeLink, updateLinkTitle } from "./link";

function seed() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "Card" });
  return ctx;
}

describe("updateLinkTitle", () => {
  it("sets a link's title (e.g. after an async unfurl resolves)", () => {
    const ctx = seed();
    const { linkId } = execute(addLink, ctx, { cardId: "c1", url: "https://example.com/jobs/1" });

    // Added with no title (optimistic host label lives in the UI shortLabel).
    expect(getCard(ctx.getBoardDoc(), "c1")?.links[0]?.title).toBeUndefined();

    execute(updateLinkTitle, ctx, { cardId: "c1", linkId, title: "Senior Frontend Engineer" });
    expect(getCard(ctx.getBoardDoc(), "c1")?.links[0]?.title).toBe("Senior Frontend Engineer");
  });

  it("is a no-op when the link was removed meanwhile (no throw, no resurrection)", () => {
    const ctx = seed();
    const { linkId } = execute(addLink, ctx, { cardId: "c1", url: "https://example.com/x" });
    execute(removeLink, ctx, { cardId: "c1", linkId });

    expect(() =>
      execute(updateLinkTitle, ctx, { cardId: "c1", linkId, title: "Late title" }),
    ).not.toThrow();
    expect(getCard(ctx.getBoardDoc(), "c1")?.links).toHaveLength(0);
  });
});
