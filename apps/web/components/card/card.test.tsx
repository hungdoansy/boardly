// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn as addColumnCmd, createBoard, createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { cardsInColumn } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { ColumnCards } from "../board/column-cards";

function setup(seed?: (ctx: MemoryContext, boardId: string, columnId: string) => void) {
  const ctx = createMemoryContext();
  const board = execute(createBoard, ctx, { title: "Board" });
  const column = execute(addColumnCmd, ctx, { boardId: board.id, title: "To Do" });
  const onOpenCard = vi.fn();
  seed?.(ctx, board.id, column.id);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnCards boardId={board.id} columnId={column.id} onOpenCard={onOpenCard} />
    </BoardlyProvider>,
  );
  return { ctx, boardId: board.id, columnId: column.id, onOpenCard };
}

const composerInput = () => screen.getByRole("textbox", { name: "New card title" });

afterEach(() => {
  cleanup();
});

describe("cards", () => {
  it("quick-adds cards which append to the bottom of the column", () => {
    const { ctx, boardId, columnId } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(composerInput(), { target: { value: "   " } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    expect(cardsInColumn(ctx.getBoardDoc(boardId), columnId)).toHaveLength(0);
  });

  it("opens the card detail when a card is clicked", () => {
    const { onOpenCard } = setup((ctx, boardId, columnId) => {
      execute(createCard, ctx, { boardId, columnId, id: "card-1", title: "Open me" });
    });
    fireEvent.click(screen.getByText("Open me"));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("creates a card and opens its detail via the 'with details' button", () => {
    const { ctx, boardId, columnId, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    const created = cardsInColumn(ctx.getBoardDoc(boardId), columnId);
    expect(created).toHaveLength(1);
    expect(onOpenCard).toHaveBeenCalledWith(created[0]!.id);
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
