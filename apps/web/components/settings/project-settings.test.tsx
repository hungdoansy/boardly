// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createProject, createMemoryContext, execute, type MemoryContext } from "@boardly/commands";
import { listProjects } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { ProjectSettings } from "./project-settings";

function setup(seed = true) {
  const ctx = createMemoryContext();
  if (seed) execute(createProject, ctx, { id: "p1", name: "Web" });
  render(
    <BoardlyProvider context={ctx}>
      <ProjectSettings />
    </BoardlyProvider>,
  );
  return ctx;
}

const projects = (ctx: MemoryContext) => listProjects(ctx.getBoardDoc());

afterEach(() => cleanup());

describe("ProjectSettings", () => {
  it("creates a project", () => {
    const ctx = setup(false);
    fireEvent.click(screen.getByRole("button", { name: /new project/i }));
    expect(projects(ctx).map((p) => p.name)).toContain("New project");
  });

  it("renames a project on blur", () => {
    const ctx = setup();
    const input = screen.getByRole("textbox", { name: "Rename Web" });
    fireEvent.change(input, { target: { value: "Frontend" } });
    fireEvent.blur(input);
    expect(projects(ctx)[0]?.name).toBe("Frontend");
  });

  it("recolors a project via the swatch popover", () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole("button", { name: "Color for Web" }));
    fireEvent.click(screen.getByRole("button", { name: "blue" }));
    expect(projects(ctx)[0]?.color).toBe("#4EA7FC");
  });

  it("hides a project (removed from the active list, shown under Hidden)", () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole("button", { name: "Hide Web" }));
    expect(projects(ctx)).toHaveLength(0);
    // It moves into the Hidden section with a restore control.
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show Web" })).toBeInTheDocument();
  });

  it("restores a hidden project via Show", () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole("button", { name: "Hide Web" }));
    fireEvent.click(screen.getByRole("button", { name: "Show Web" }));
    expect(projects(ctx).map((p) => p.name)).toEqual(["Web"]);
  });
});
