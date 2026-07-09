// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn as addColumnCmd, createBoard, createCard, execute } from "@boardly/commands";
import { createMemoryContext } from "@boardly/commands";
import { getCard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useCardById } from "../../lib/use-board";
import { Checklist } from "./checklist";

function Harness({ boardId, cardId }: { boardId: string; cardId: string }) {
  const card = useCardById(boardId, cardId);
  return card ? <Checklist boardId={boardId} card={card} /> : null;
}

function setup() {
  const ctx = createMemoryContext();
  execute(createBoard, ctx, { id: "b1", title: "Board" });
  execute(addColumnCmd, ctx, { boardId: "b1", id: "col1", title: "To Do" });
  execute(createCard, ctx, { boardId: "b1", id: "c1", columnId: "col1", title: "Card" });
  render(
    <BoardlyProvider context={ctx}>
      <Harness boardId="b1" cardId="c1" />
    </BoardlyProvider>,
  );
  return ctx;
}

const field = () => screen.getByRole("textbox", { name: "New checklist item" });
const addItem = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.keyDown(field(), { key: "Enter" });
};

afterEach(() => {
  cleanup();
});

describe("Checklist", () => {
  it("adds items and tracks progress", () => {
    setup();
    addItem("Design");
    addItem("Build");
    expect(screen.getByText("0/2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle Design" }));
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("deleting an item updates the count and hides the indicator when empty", () => {
    setup();
    addItem("Only item");
    expect(screen.getByText("0/1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Only item" }));
    expect(screen.queryByText("0/1")).not.toBeInTheDocument();
  });

  it("reorders items", () => {
    const ctx = setup();
    addItem("First");
    addItem("Second");

    // Second row's "Move up" (first row's is disabled).
    const moveUps = screen.getAllByRole("button", { name: "Move up" });
    fireEvent.click(moveUps[1]!);

    expect(getCard(ctx.getBoardDoc("b1"), "c1")?.checklist.map((i) => i.text)).toEqual([
      "Second",
      "First",
    ]);
  });
});
