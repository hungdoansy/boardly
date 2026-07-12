import { cardsInStatus, initBoard } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { createCard } from "./card";
import { setCardStatus } from "./status";

function seed() {
  const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
  return ctx;
}

describe("setCardStatus", () => {
  it("changes a card's status without reordering (keeps relative order)", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "in_progress" });
    execute(createCard, ctx, { id: "b", title: "B", status: "in_progress" });
    const before = cardsInStatus(ctx.getBoardDoc(), "in_progress").map((c) => c.ord);

    const done = execute(setCardStatus, ctx, { cardId: "a", status: "done" });
    expect(done?.status).toBe("done");

    // a moved columns; its ord is unchanged (no reorder), b keeps its slot.
    expect(cardsInStatus(ctx.getBoardDoc(), "done").map((c) => c.id)).toEqual(["a"]);
    expect(cardsInStatus(ctx.getBoardDoc(), "in_progress").map((c) => c.id)).toEqual(["b"]);
    expect(done?.ord).toBe(before[0]);
  });

  it("rejects a status outside the eight via zod before mutating", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    expect(() =>
      execute(setCardStatus, ctx, { cardId: "a", status: "shipped" as never }),
    ).toThrow(ZodError);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });
});
