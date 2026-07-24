import { cardsInStatus, initBoard } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import {
  addRelatedCard,
  archiveCard,
  archiveCards,
  createCard,
  deleteCard,
  moveCard,
  removeRelatedCard,
} from "./card";

function seed() {
  const ctx = createMemoryContext({ clientId: "c1", now: () => 100 });
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
  return ctx;
}

describe("createCard", () => {
  it("creates a card in Todo by default and honors an explicit status", () => {
    const ctx = seed();
    const a = execute(createCard, ctx, { id: "a", title: "Default" });
    expect(a?.status).toBe("todo");

    const b = execute(createCard, ctx, { id: "b", title: "Explicit", status: "in_progress" });
    expect(b?.status).toBe("in_progress");
    expect(cardsInStatus(ctx.getBoardDoc(), "in_progress").map((c) => c.id)).toEqual(["b"]);
  });

  it("rejects a status outside the eight via zod before mutating", () => {
    const ctx = seed();
    expect(() => execute(createCard, ctx, { title: "Bad", status: "nope" as never })).toThrow(
      ZodError,
    );
  });
});

describe("moveCard", () => {
  it("sets the target status and slots the card between two neighbors", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "in_review" });
    execute(createCard, ctx, { id: "b", title: "B", status: "in_review" });
    execute(createCard, ctx, { id: "c", title: "C", status: "todo" });

    // a and b are already ordered [a, b] in in_review; drop c between them.
    const moved = execute(moveCard, ctx, {
      cardId: "c",
      toStatus: "in_review",
      afterId: "a",
      beforeId: "b",
    });

    expect(moved?.status).toBe("in_review");
    expect(cardsInStatus(ctx.getBoardDoc(), "in_review").map((c) => c.id)).toEqual(["a", "c", "b"]);
    // Card left its old status column.
    expect(cardsInStatus(ctx.getBoardDoc(), "todo")).toHaveLength(0);
  });

  it("reorders within a status when neighbors are given (no status change)", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "todo" });
    execute(createCard, ctx, { id: "b", title: "B", status: "todo" });

    // Move a to the end (after b).
    execute(moveCard, ctx, { cardId: "a", toStatus: "todo", afterId: "b", beforeId: null });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("rejects a status outside the eight via zod before mutating", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    expect(() => execute(moveCard, ctx, { cardId: "a", toStatus: "sideways" as never })).toThrow(
      ZodError,
    );
    // Untouched: still in Todo.
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });
});

describe("related cards", () => {
  it("relates two cards symmetrically and unrelates them", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    execute(createCard, ctx, { id: "b", title: "B" });

    const a = execute(addRelatedCard, ctx, { cardId: "a", relatedId: "b" });
    expect(a?.relatedIds).toEqual(["b"]);
    expect(execute(addRelatedCard, ctx, { cardId: "b", relatedId: "a" })?.relatedIds).toEqual([
      "a",
    ]);

    const unrelated = execute(removeRelatedCard, ctx, { cardId: "a", relatedId: "b" });
    expect(unrelated?.relatedIds).toEqual([]);
  });
});

describe("deleteCard", () => {
  it("hard-deletes a card so it is no longer fetchable", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    const res = execute(deleteCard, ctx, { cardId: "a" });
    expect(res).toEqual({ id: "a", deleted: true });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo")).toHaveLength(0);
  });
});

describe("archiveCards", () => {
  it("archives every supplied live card so the column empties, and reports them", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A", status: "done" });
    execute(createCard, ctx, { id: "b", title: "B", status: "done" });
    execute(createCard, ctx, { id: "c", title: "C", status: "todo" });

    const res = execute(archiveCards, ctx, { cardIds: ["a", "b"] });
    expect(res).toEqual({ archivedIds: ["a", "b"], count: 2 });
    // Both left the (live) Done column; the untouched card stays.
    expect(cardsInStatus(ctx.getBoardDoc(), "done")).toHaveLength(0);
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["c"]);
  });

  it("is a no-op for an empty id list", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    const res = execute(archiveCards, ctx, { cardIds: [] });
    expect(res).toEqual({ archivedIds: [], count: 0 });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["a"]);
  });

  it("ignores unknown and already-archived ids, archiving only the valid ones", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" });
    execute(createCard, ctx, { id: "b", title: "B" });
    execute(archiveCard, ctx, { cardId: "b" }); // already archived

    const res = execute(archiveCards, ctx, { cardIds: ["a", "b", "missing"] });
    expect(res).toEqual({ archivedIds: ["a"], count: 1 });
    expect(cardsInStatus(ctx.getBoardDoc(), "todo")).toHaveLength(0);
  });
});

describe("createCard with filter-seeded defaults", () => {
  it("persists a seeded priority and labels, and floats an Urgent card to the top", () => {
    const ctx = seed();
    execute(createCard, ctx, { id: "a", title: "A" }); // plain, appends
    const seeded = execute(createCard, ctx, {
      id: "b",
      title: "B",
      priority: 4,
      labelIds: ["l1", "l2"],
    });
    expect(seeded?.priority).toBe(4);
    expect(seeded?.labelIds.sort()).toEqual(["l1", "l2"]);
    // Urgent → slotted at the top of Todo (before the earlier plain card).
    expect(cardsInStatus(ctx.getBoardDoc(), "todo").map((c) => c.id)).toEqual(["b", "a"]);
  });
});
