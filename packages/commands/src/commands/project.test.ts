import { getCard, initBoard, listProjects } from "@boardly/sync";
import { describe, expect, it } from "vitest";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { addColumn } from "./column";
import { createCard } from "./card";
import {
  archiveProject,
  createProject,
  recolorProject,
  renameProject,
  setCardProject,
} from "./project";

function seed() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(addColumn, ctx, { id: "col1", title: "To Do" });
  return ctx;
}

describe("project commands", () => {
  it("creates a project with a default color and lists it", () => {
    const ctx = seed();
    const project = execute(createProject, ctx, { id: "p1", name: "Web" });
    expect(project?.name).toBe("Web");
    expect(project?.color).toBeTruthy();
    expect(listProjects(ctx.getBoardDoc()).map((p) => p.id)).toEqual(["p1"]);
  });

  it("renames and recolors a project", () => {
    const ctx = seed();
    execute(createProject, ctx, { id: "p1", name: "Web" });
    execute(renameProject, ctx, { projectId: "p1", name: "Frontend" });
    execute(recolorProject, ctx, { projectId: "p1", color: "#4EA7FC" });
    const p = listProjects(ctx.getBoardDoc()).find((x) => x.id === "p1");
    expect(p?.name).toBe("Frontend");
    expect(p?.color).toBe("#4EA7FC");
  });

  it("archiving hides the project but leaves a card's projectId intact", () => {
    const ctx = seed();
    execute(createProject, ctx, { id: "p1", name: "Web" });
    execute(createCard, ctx, {
      id: "c1",
      columnId: "col1",
      title: "Card",
      projectId: "p1",
    });
    execute(archiveProject, ctx, { projectId: "p1" });

    expect(listProjects(ctx.getBoardDoc())).toHaveLength(0);
    expect(getCard(ctx.getBoardDoc(), "c1")?.projectId).toBe("p1");
  });

  it("assigns a card to a project at creation and lets it be changed/cleared", () => {
    const ctx = seed();
    execute(createProject, ctx, { id: "p1", name: "Web" });
    execute(createProject, ctx, { id: "p2", name: "API" });
    execute(createCard, ctx, {
      id: "c1",
      columnId: "col1",
      title: "Card",
      projectId: "p1",
    });
    expect(getCard(ctx.getBoardDoc(), "c1")?.projectId).toBe("p1");

    execute(setCardProject, ctx, { cardId: "c1", projectId: "p2" });
    expect(getCard(ctx.getBoardDoc(), "c1")?.projectId).toBe("p2");

    execute(setCardProject, ctx, { cardId: "c1", projectId: null });
    expect(getCard(ctx.getBoardDoc(), "c1")?.projectId).toBeUndefined();
  });
});
