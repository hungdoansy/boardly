// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createCard,
  execute,
  moveCard,
  setCardPriority,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority } from "@boardly/domain";
import { initBoard } from "@boardly/sync";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardDetail } from "./card-detail";

function setup(seed?: (ctx: MemoryContext, columns: string[]) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const todo = execute(addColumnCmd, ctx, { title: "To Do" })!;
  const doing = execute(addColumnCmd, ctx, { title: "Doing" })!;
  execute(createCard, ctx, { columnId: todo.id, id: "c1", title: "Card" });
  seed?.(ctx, [todo.id, doing.id]);
  render(
    <BoardlyProvider context={ctx}>
      <CardDetail cardId="c1" onClose={() => {}} />
    </BoardlyProvider>,
  );
  return { ctx };
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
    setup((ctx, [, doing]) => {
      execute(moveCard, ctx, { cardId: "c1", toColumnId: doing });
      execute(setCardPriority, ctx, { cardId: "c1", priority: Priority.High });
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
