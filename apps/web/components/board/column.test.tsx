// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn as addColumnCmd, createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { initBoard, liveColumns, reclaimCards } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <BoardView />
    </BoardlyProvider>,
  );
  return { ctx };
}

function addColumnViaUi(title: string): void {
  fireEvent.click(screen.getByRole("button", { name: /add column/i }));
  const input = screen.getByRole("textbox", { name: "New column name" });
  fireEvent.change(input, { target: { value: title } });
  fireEvent.keyDown(input, { key: "Enter" });
}

afterEach(() => {
  cleanup();
});

describe("BoardView columns", () => {
  it("shows the add-column affordance when a board has no columns", () => {
    setup();
    expect(screen.getByRole("button", { name: /add column/i })).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("adds columns which persist in ord order", () => {
    const { ctx } = setup();
    addColumnViaUi("To Do");
    addColumnViaUi("Doing");

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("Doing")).toBeInTheDocument();
    expect(liveColumns(ctx.getBoardDoc()).map((c) => c.title)).toEqual(["To Do", "Doing"]);
  });

  it("renames a column inline", () => {
    setup((ctx) => {
      execute(addColumnCmd, ctx, { title: "To Do" });
    });
    fireEvent.dblClick(screen.getByText("To Do"));
    const input = screen.getByRole("textbox", { name: "Column name" });
    fireEvent.change(input, { target: { value: "Todo" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Todo")).toBeInTheDocument();
  });

  it("deleting a column moves its cards to the Unsorted bucket (not lost)", () => {
    const { ctx } = setup((ctx) => {
      const column = execute(addColumnCmd, ctx, { title: "To Do" });
      execute(createCard, ctx, { columnId: column.id, title: "Keep me" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete To Do" }));

    expect(liveColumns(ctx.getBoardDoc())).toHaveLength(0);
    expect(reclaimCards(ctx.getBoardDoc())).toHaveLength(1);
    expect(screen.getByText("Unsorted")).toBeInTheDocument();
  });
});
