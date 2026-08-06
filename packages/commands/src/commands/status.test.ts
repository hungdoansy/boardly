import { cardsInStatus, initBoard } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { createCard } from "./card";
import { setCardsStatus, setCardStatus } from "./status";

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
    expect(() => execute(setCardStatus, ctx, { cardId: "a", status: "shipped" as never })).toThrow(
      ZodError,
    );
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("setCardsStatus", () => {
  it("moves every supplied card to the status, leaving untargeted cards alone", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "todo" });
    execute(createCard, ctx, { id: "b", title: "B", status: "todo" });
    execute(createCard, ctx, { id: "c", title: "C", status: "todo" });

    // Only a and b are "visible" — c stands in for a filtered-out card.
    const res = execute(setCardsStatus, ctx, { cardIds: ["a", "b"], status: "done" });
    expect(res).toEqual({ updatedIds: ["a", "b"], count: 2 });
    expect(cardsInStatus(ctx.getBoardDoc(), "done").map((c) => c.id)).toEqual(["a", "b"]);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["c"]);
  });

  it("ignores unknown ids and cards already at the status, so the count is truthful", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "todo" });
    execute(createCard, ctx, { id: "b", title: "B", status: "done" }); // already there

    const res = execute(setCardsStatus, ctx, {
      cardIds: ["a", "b", "missing"],
      status: "done",
    });
    expect(res).toEqual({ updatedIds: ["a"], count: 1 });
    expect(cardsInStatus(ctx.getBoardDoc(), "done").map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("is a no-op for an empty id list", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    const res = execute(setCardsStatus, ctx, { cardIds: [], status: "done" });
    expect(res).toEqual({ updatedIds: [], count: 0 });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });

  it("rejects a status outside the eight via zod before mutating anything", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    expect(() =>
      execute(setCardsStatus, ctx, { cardIds: ["a"], status: "shipped" as never }),
    ).toThrow(ZodError);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });
});
