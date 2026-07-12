// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createProject, createMemoryContext, execute, type MemoryContext } from "@boardly/commands";
import { listProjects } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { setSelectedProject } from "../../lib/use-projects";
import { ProjectList } from "./project-list";

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  execute(createProject, ctx, { id: "p1", name: "Web" });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <ProjectList />
    </BoardlyProvider>,
  );
  return ctx;
}

beforeEach(() => setSelectedProject(null)); // reset the module-level scope
afterEach(() => cleanup());

describe("ProjectList", () => {
  it("lists All plus the board's projects, with All selected by default", () => {
    setup();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Web" })).toBeInTheDocument();
  });

  it("selecting a project scopes to it (and deselects All)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Web" }));
    expect(screen.getByRole("button", { name: "Web" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("creating a project adds it and selects it", () => {
    const ctx = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    expect(listProjects(ctx.getBoardDoc()).map((p) => p.name)).toContain("New project");
    expect(screen.getByRole("button", { name: "New project" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows no active row while the Settings view is open", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Web" }));
    expect(screen.getByRole("button", { name: "Web" })).toHaveAttribute("aria-pressed", "true");

    // Enter Settings: the scope is not shown, so neither All nor Web reads active.
    act(() => {
      window.location.hash = "settings";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Web" })).toHaveAttribute("aria-pressed", "false");

    // Clicking a project from Settings navigates back to that project's board.
    fireEvent.click(screen.getByRole("button", { name: "Web" }));
    expect(window.location.hash).toBe("#p/p1");
    expect(screen.getByRole("button", { name: "Web" })).toHaveAttribute("aria-pressed", "true");
  });
});
