import { getCard, initBoard, listLabels } from "@boardly/sync";
import { describe, expect, it } from "vitest";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { addColumn } from "./column";
import { createCard } from "./card";
import { assignLabel, createLabel, deleteLabel, renameLabel, unassignLabel } from "./label";

function seed() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(addColumn, ctx, { id: "col1", title: "To Do" });
  execute(createCard, ctx, { id: "c1", columnId: "col1", title: "Card" });
  return ctx;
}

describe("label commands", () => {
  it("creates, assigns, and unassigns labels", () => {
    const ctx = seed();
    const label = execute(createLabel, ctx, {
      id: "l1",
      name: "Bug",
      color: "#EB5757",
    });
    expect(label?.name).toBe("Bug");

    execute(assignLabel, ctx, { cardId: "c1", labelId: "l1" });
    expect(getCard(ctx.getBoardDoc(), "c1")?.labelIds).toContain("l1");

    execute(unassignLabel, ctx, { cardId: "c1", labelId: "l1" });
    expect(getCard(ctx.getBoardDoc(), "c1")?.labelIds).not.toContain("l1");
  });

  it("renames a label in the palette (propagates by id)", () => {
    const ctx = seed();
    execute(createLabel, ctx, { id: "l1", name: "Bug", color: "#EB5757" });
    execute(renameLabel, ctx, { labelId: "l1", name: "Defect" });
    expect(listLabels(ctx.getBoardDoc()).find((l) => l.id === "l1")?.name).toBe("Defect");
  });

  it("deleting a label removes it from the palette and from every card", () => {
    const ctx = seed();
    execute(createLabel, ctx, { id: "l1", name: "Bug", color: "#EB5757" });
    execute(assignLabel, ctx, { cardId: "c1", labelId: "l1" });

    execute(deleteLabel, ctx, { labelId: "l1" });

    expect(listLabels(ctx.getBoardDoc())).toHaveLength(0);
    expect(getCard(ctx.getBoardDoc(), "c1")?.labelIds).not.toContain("l1");
  });
});
