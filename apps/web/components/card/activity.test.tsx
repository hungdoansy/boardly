// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createBoard,
  createCard,
  execute,
  moveCard,
  setCardPriority,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority } from "@boardly/domain";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardDetail } from "./card-detail";

function setup(seed?: (ctx: MemoryContext, boardId: string, columns: string[]) => void) {
  const ctx = createMemoryContext();
  const board = execute(createBoard, ctx, { title: "Board" });
  const todo = execute(addColumnCmd, ctx, { boardId: board.id, title: "To Do" })!;
  const doing = execute(addColumnCmd, ctx, { boardId: board.id, title: "Doing" })!;
  execute(createCard, ctx, { boardId: board.id, columnId: todo.id, id: "c1", title: "Card" });
  seed?.(ctx, board.id, [todo.id, doing.id]);
  render(
    <BoardlyProvider context={ctx}>
      <CardDetail boardId={board.id} cardId="c1" onClose={() => {}} />
    </BoardlyProvider>,
  );
  return { ctx, boardId: board.id };
}

afterEach(() => {
  cleanup();
});

function activityList(): HTMLElement {
  return screen.getByRole("list", { name: "Activity" });
}

describe("CardActivity timeline", () => {
  it("shows a 'Created' entry for a new card", () => {
    setup();
    expect(within(activityList()).getByText("Created")).toBeInTheDocument();
  });

  it("renders move + priority entries newest-first with readable text", () => {
    setup((ctx, boardId, [, doing]) => {
      execute(moveCard, ctx, { boardId, cardId: "c1", toColumnId: doing });
      execute(setCardPriority, ctx, { boardId, cardId: "c1", priority: Priority.High });
    });
    const items = within(activityList()).getAllByRole("listitem");
    // newest-first: priority, then move, then created
    expect(items[0]).toHaveTextContent("Priority");
    expect(items[0]).toHaveTextContent("High");
    expect(items[1]).toHaveTextContent("Moved from");
    expect(items[1]).toHaveTextContent("To Do");
    expect(items[1]).toHaveTextContent("Doing");
    expect(items[2]).toHaveTextContent("Created");
  });
});
