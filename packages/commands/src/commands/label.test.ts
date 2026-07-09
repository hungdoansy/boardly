import { getCard, listLabels } from "@boardly/sync";
import { describe, expect, it } from "vitest";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { createBoard } from "./board";
import { addColumn } from "./column";
import { createCard } from "./card";
import { assignLabel, createLabel, deleteLabel, renameLabel, unassignLabel } from "./label";

function seed() {
  const ctx = createMemoryContext();
  execute(createBoard, ctx, { id: "b1", title: "Board" });
  execute(addColumn, ctx, { boardId: "b1", id: "col1", title: "To Do" });
  execute(createCard, ctx, { boardId: "b1", id: "c1", columnId: "col1", title: "Card" });
  return ctx;
}

describe("label commands", () => {
  it("creates, assigns, and unassigns labels", () => {
    const ctx = seed();
    const label = execute(createLabel, ctx, {
      boardId: "b1",
      id: "l1",
      name: "Bug",
      color: "#EB5757",
    });
    expect(label?.name).toBe("Bug");

    execute(assignLabel, ctx, { boardId: "b1", cardId: "c1", labelId: "l1" });
    expect(getCard(ctx.getBoardDoc("b1"), "c1")?.labelIds).toContain("l1");

    execute(unassignLabel, ctx, { boardId: "b1", cardId: "c1", labelId: "l1" });
    expect(getCard(ctx.getBoardDoc("b1"), "c1")?.labelIds).not.toContain("l1");
  });

  it("renames a label in the palette (propagates by id)", () => {
    const ctx = seed();
    execute(createLabel, ctx, { boardId: "b1", id: "l1", name: "Bug", color: "#EB5757" });
    execute(renameLabel, ctx, { boardId: "b1", labelId: "l1", name: "Defect" });
    expect(listLabels(ctx.getBoardDoc("b1")).find((l) => l.id === "l1")?.name).toBe("Defect");
  });

  it("deleting a label removes it from the palette and from every card", () => {
    const ctx = seed();
    execute(createLabel, ctx, { boardId: "b1", id: "l1", name: "Bug", color: "#EB5757" });
    execute(assignLabel, ctx, { boardId: "b1", cardId: "c1", labelId: "l1" });

    execute(deleteLabel, ctx, { boardId: "b1", labelId: "l1" });

    expect(listLabels(ctx.getBoardDoc("b1"))).toHaveLength(0);
    expect(getCard(ctx.getBoardDoc("b1"), "c1")?.labelIds).not.toContain("l1");
  });
});
