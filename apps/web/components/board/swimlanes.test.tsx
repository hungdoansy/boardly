// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createBoard,
  createCard,
  execute,
  setCardPriority,
  setColumnWipLimit,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority } from "@boardly/domain";
import { liveColumns } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";

function setup(
  seed: (ctx: MemoryContext, boardId: string) => void,
  props?: { groupBy?: "status" | "priority" | "severity" | "label" | "assignee" | null },
) {
  const ctx = createMemoryContext();
  const board = execute(createBoard, ctx, { title: "Board" });
  seed(ctx, board.id);
  render(
    <BoardlyProvider context={ctx}>
      <BoardView boardId={board.id} groupBy={props?.groupBy ?? null} />
    </BoardlyProvider>,
  );
  return { ctx, boardId: board.id };
}

afterEach(() => {
  cleanup();
});

describe("Swimlanes (grouping)", () => {
  it("groups cards into lanes by priority with an ungrouped lane last", () => {
    setup(
      (ctx, id) => {
        const col = execute(addColumnCmd, ctx, { boardId: id, title: "Todo" });
        const a = execute(createCard, ctx, {
          boardId: id,
          columnId: col.id,
          title: "Urgent card",
        })!;
        const b = execute(createCard, ctx, { boardId: id, columnId: col.id, title: "High card" })!;
        execute(createCard, ctx, { boardId: id, columnId: col.id, title: "No-prio card" });
        execute(setCardPriority, ctx, { boardId: id, cardId: a.id, priority: Priority.Urgent });
        execute(setCardPriority, ctx, { boardId: id, cardId: b.id, priority: Priority.High });
      },
      { groupBy: "priority" },
    );

    const lanes = screen.getAllByRole("region", { name: /^Lane:/ });
    expect(lanes.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Lane: Urgent",
      "Lane: High",
      "Lane: No priority",
    ]);
    // Each card renders under its lane.
    expect(screen.getByText("Urgent card")).toBeInTheDocument();
    expect(screen.getByText("High card")).toBeInTheDocument();
    expect(screen.getByText("No-prio card")).toBeInTheDocument();
  });

  it("shows an empty-state when no cards match", () => {
    setup(
      (ctx, id) => {
        execute(addColumnCmd, ctx, { boardId: id, title: "Todo" });
      },
      { groupBy: "priority" },
    );
    expect(screen.getByText(/no cards match/i)).toBeInTheDocument();
  });

  it("renders the normal column board (no lanes) when groupBy is null", () => {
    setup((ctx, id) => {
      execute(addColumnCmd, ctx, { boardId: id, title: "Todo" });
    });
    expect(screen.queryByRole("region", { name: /^Lane:/ })).not.toBeInTheDocument();
  });
});

describe("WIP limits", () => {
  it("shows count/limit and flags over-limit columns", () => {
    setup((ctx, id) => {
      const col = execute(addColumnCmd, ctx, { boardId: id, title: "Todo" });
      execute(createCard, ctx, { boardId: id, columnId: col.id, title: "One" });
      execute(createCard, ctx, { boardId: id, columnId: col.id, title: "Two" });
      execute(setColumnWipLimit, ctx, { boardId: id, columnId: col.id, wipLimit: 2 });
    });
    const badge = screen.getByRole("button", { name: "WIP limit for Todo" });
    expect(badge).toHaveTextContent("2/2");
    expect(badge.className).toContain("text-[var(--danger)]"); // at/over limit
  });

  it("sets a WIP limit through the popover", () => {
    const { ctx, boardId } = setup((ctx, id) => {
      execute(addColumnCmd, ctx, { boardId: id, title: "Todo" });
    });
    fireEvent.click(screen.getByRole("button", { name: "WIP limit for Todo" }));
    const input = screen.getByRole("spinbutton", { name: "WIP limit" });
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(liveColumns(ctx.getBoardDoc(boardId))[0]!.wipLimit).toBe(3);
  });
});
