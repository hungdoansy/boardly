// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext } from "@boardly/commands";
import { listBoards, liveColumns } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardList } from "./board-list";

function renderList() {
  const ctx = createMemoryContext();
  render(
    <BoardlyProvider context={ctx}>
      <BoardList />
    </BoardlyProvider>,
  );
  return ctx;
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("BoardList", () => {
  it("shows an empty state with no boards", () => {
    renderList();
    expect(screen.getByText(/no boards yet/i)).toBeInTheDocument();
  });

  it("creates a board with three default columns via the command layer", () => {
    const ctx = renderList();
    fireEvent.click(screen.getByRole("button", { name: "New board" }));

    expect(screen.getByText("New board")).toBeInTheDocument();
    const boards = listBoards(ctx.getWorkspaceDoc());
    expect(boards).toHaveLength(1);
    expect(liveColumns(ctx.getBoardDoc(boards[0]!.id)).map((c) => c.title)).toEqual([
      "To Do",
      "Doing",
      "Done",
    ]);
  });

  it("renames a board inline", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.dblClick(screen.getByText("New board"));

    const input = screen.getByRole("textbox", { name: "Board name" });
    fireEvent.change(input, { target: { value: "Roadmap" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Roadmap")).toBeInTheDocument();
  });

  it("archives a board (removed from the visible list)", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "New board" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive New board" }));

    expect(screen.getByText(/no boards yet/i)).toBeInTheDocument();
  });
});
