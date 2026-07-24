// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext, createProject, execute, type MemoryContext } from "@boardly/commands";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { getSelectedProject, setSelectedProject } from "../../lib/use-projects";
import { ProjectSwitcher } from "./project-switcher";

beforeEach(() => setSelectedProject(null)); // reset the hash-backed scope
afterEach(() => cleanup());

function setup(seed: Array<{ id: string; name: string }> = []) {
  const ctx: MemoryContext = createMemoryContext();
  for (const p of seed) execute(createProject, ctx, p);
  const onOpenChange = vi.fn();
  render(
    <BoardlyProvider context={ctx}>
      <ProjectSwitcher open onOpenChange={onOpenChange} />
    </BoardlyProvider>,
  );
  return { ctx, onOpenChange };
}

describe("ProjectSwitcher", () => {
  it("selecting a project scopes the board and closes", () => {
    const { onOpenChange } = setup([{ id: "p1", name: "Web" }]);
    act(() => {
      fireEvent.click(screen.getByRole("option", { name: /Web/ }));
    });
    expect(getSelectedProject()).toBe("p1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecting All resets the scope to null", () => {
    setSelectedProject("p1");
    const { onOpenChange } = setup([{ id: "p1", name: "Web" }]);
    act(() => {
      fireEvent.click(screen.getByRole("option", { name: /^All/ }));
    });
    expect(getSelectedProject()).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("typing filters the project list", () => {
    setup([
      { id: "p1", name: "Web" },
      { id: "p2", name: "Mobile" },
    ]);
    expect(screen.getByRole("option", { name: /Web/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Mobile/ })).toBeInTheDocument();

    act(() => {
      fireEvent.change(screen.getByPlaceholderText("Go to project…"), {
        target: { value: "Mob" },
      });
    });
    expect(screen.queryByRole("option", { name: /Web/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Mobile/ })).toBeInTheDocument();
  });

  it("with no projects, only All is offered", () => {
    setup([]);
    expect(screen.getByRole("option", { name: /^All/ })).toBeInTheDocument();
    // Exactly one option (All), no project rows.
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
