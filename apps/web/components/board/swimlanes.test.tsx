// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createCard,
  execute,
  setCardPriority,
  setColumnWipLimit,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority } from "@boardly/domain";
import { initBoard, liveColumns } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";

function setup(
  seed: (ctx: MemoryContext) => void,
  props?: { groupBy?: "status" | "priority" | "severity" | "label" | "assignee" | null },
) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  seed(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <BoardView groupBy={props?.groupBy ?? null} />
    </BoardlyProvider>,
  );
  return { ctx };
}

afterEach(() => {
  cleanup();
});

describe("Swimlanes (grouping)", () => {
  it("groups cards into lanes by priority with an ungrouped lane last", () => {
    setup(
      (ctx) => {
        const col = execute(addColumnCmd, ctx, { title: "Todo" });
        const a = execute(createCard, ctx, {
          columnId: col.id,
          title: "Urgent card",
        })!;
        const b = execute(createCard, ctx, { columnId: col.id, title: "High card" })!;
        execute(createCard, ctx, { columnId: col.id, title: "No-prio card" });
        execute(setCardPriority, ctx, { cardId: a.id, priority: Priority.Urgent });
        execute(setCardPriority, ctx, { cardId: b.id, priority: Priority.High });
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
      (ctx) => {
        execute(addColumnCmd, ctx, { title: "Todo" });
      },
      { groupBy: "priority" },
    );
    expect(screen.getByText(/no cards match/i)).toBeInTheDocument();
  });

  it("renders the normal column board (no lanes) when groupBy is null", () => {
    setup((ctx) => {
      execute(addColumnCmd, ctx, { title: "Todo" });
    });
    expect(screen.queryByRole("region", { name: /^Lane:/ })).not.toBeInTheDocument();
  });
});

describe("WIP limits", () => {
  it("shows count/limit and flags over-limit columns", () => {
    setup((ctx) => {
      const col = execute(addColumnCmd, ctx, { title: "Todo" });
      execute(createCard, ctx, { columnId: col.id, title: "One" });
      execute(createCard, ctx, { columnId: col.id, title: "Two" });
      execute(setColumnWipLimit, ctx, { columnId: col.id, wipLimit: 2 });
    });
    const badge = screen.getByRole("button", { name: "WIP limit for Todo" });
    expect(badge).toHaveTextContent("2/2");
    expect(badge.className).toContain("text-[var(--danger)]"); // at/over limit
  });

  it("sets a WIP limit through the popover", () => {
    const { ctx } = setup((ctx) => {
      execute(addColumnCmd, ctx, { title: "Todo" });
    });
    fireEvent.click(screen.getByRole("button", { name: "WIP limit for Todo" }));
    const input = screen.getByRole("spinbutton", { name: "WIP limit" });
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(liveColumns(ctx.getBoardDoc())[0]!.wipLimit).toBe(3);
  });
});
