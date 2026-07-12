// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute, moveCard, setCardPriority } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority, Status } from "@boardly/domain";
import { initBoard } from "@boardly/sync";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardDetail } from "./card-detail";

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { status: Status.Todo, id: "c1", title: "Card" });
  seed?.(ctx);
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

  it("renders status (from a drag/move) + priority entries newest-first", () => {
    setup((ctx) => {
      // A drag applies status immediately (a card's column IS its status).
      execute(moveCard, ctx, { cardId: "c1", toStatus: Status.InProgress });
      execute(setCardPriority, ctx, { cardId: "c1", priority: Priority.High });
    });
    const items = within(activityList()).getAllByRole("listitem");
    // newest-first: priority, then the status move, then created
    expect(items[0]).toHaveTextContent("Priority");
    expect(items[0]).toHaveTextContent("High");
    expect(items[1]).toHaveTextContent("Status");
    expect(items[1]).toHaveTextContent("In Progress");
    expect(items[2]).toHaveTextContent("Created");
  });
});
