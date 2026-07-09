// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn as addColumnCmd, createBoard, createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { cardsInColumn } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { ColumnCards } from "../board/column-cards";

function setup(seed?: (ctx: MemoryContext, boardId: string, columnId: string) => void) {
  const ctx = createMemoryContext();
  const board = execute(createBoard, ctx, { title: "Board" });
  const column = execute(addColumnCmd, ctx, { boardId: board.id, title: "To Do" });
  seed?.(ctx, board.id, column.id);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnCards boardId={board.id} columnId={column.id} />
    </BoardlyProvider>,
  );
  return { ctx, boardId: board.id, columnId: column.id };
}

const composerInput = () => screen.getByRole("textbox", { name: "New card title" });

afterEach(() => {
  cleanup();
});

describe("cards", () => {
  it("quick-adds cards which append to the bottom of the column", () => {
    const { ctx, boardId, columnId } = setup();
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));

    fireEvent.change(composerInput(), { target: { value: "First" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    fireEvent.change(composerInput(), { target: { value: "Second" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(cardsInColumn(ctx.getBoardDoc(boardId), columnId).map((c) => c.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("rejects a whitespace-only title", () => {
    const { ctx, boardId, columnId } = setup();
    fireEvent.click(screen.getByRole("button", { name: /add card/i }));
    fireEvent.change(composerInput(), { target: { value: "   " } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    expect(cardsInColumn(ctx.getBoardDoc(boardId), columnId)).toHaveLength(0);
  });

  it("edits a card title inline", () => {
    setup((ctx, boardId, columnId) => {
      execute(createCard, ctx, { boardId, columnId, title: "Old" });
    });
    fireEvent.dblClick(screen.getByText("Old"));
    const input = screen.getByRole("textbox", { name: "Card title" });
    fireEvent.change(input, { target: { value: "New" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("archives a card", () => {
    setup((ctx, boardId, columnId) => {
      execute(createCard, ctx, { boardId, columnId, title: "Bye" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive Bye" }));
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("renders many cards without error (perf sanity)", () => {
    setup((ctx, boardId, columnId) => {
      for (let i = 0; i < 500; i += 1) {
        execute(createCard, ctx, { boardId, columnId, title: `Card ${i}` });
      }
    });
    expect(screen.getAllByRole("article")).toHaveLength(500);
  });
});
