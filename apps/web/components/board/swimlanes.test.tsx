// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute, setCardPriority } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Priority } from "@boardly/domain";
import { initBoard } from "@boardly/sync";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";

function setup(
  seed: (ctx: MemoryContext) => void,
  props?: { groupBy?: "status" | "priority" | "label" | "assignee" | null },
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
        const a = execute(createCard, ctx, { title: "Urgent card" })!;
        const b = execute(createCard, ctx, { title: "High card" })!;
        execute(createCard, ctx, { title: "No-prio card" });
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
    setup(() => {}, { groupBy: "priority" });
    expect(screen.getByText(/no cards match/i)).toBeInTheDocument();
  });

  it("renders the normal column board (no lanes) when groupBy is null", () => {
    setup(() => {});
    expect(screen.queryByRole("region", { name: /^Lane:/ })).not.toBeInTheDocument();
  });
});
