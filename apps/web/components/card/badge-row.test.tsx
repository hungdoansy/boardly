// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { Card } from "@boardly/domain";
import {
  addColumn as addColumnCmd,
  createBoard,
  createCard,
  execute,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { getBoard, getCard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BadgeConfig } from "../board/badge-config";
import { BadgeRow } from "./badge-row";

function makeCard(mutate?: (ctx: MemoryContext) => void): Card {
  const ctx = createMemoryContext();
  execute(createBoard, ctx, { id: "b1", title: "Board" });
  execute(addColumnCmd, ctx, { boardId: "b1", id: "col1", title: "To Do" });
  execute(createCard, ctx, { boardId: "b1", id: "c1", columnId: "col1", title: "Card" });
  mutate?.(ctx);
  return getCard(ctx.getBoardDoc("b1"), "c1")!;
}

afterEach(() => {
  cleanup();
});

describe("BadgeRow", () => {
  it("renders only configured fields, in configured order", () => {
    const card = makeCard((ctx) => {
      execute(setCardSeverity, ctx, { boardId: "b1", cardId: "c1", severity: 2 });
      execute(setCardDueDate, ctx, {
        boardId: "b1",
        cardId: "c1",
        dueDate: { at: new Date(2027, 0, 15).getTime(), hasTime: false },
      });
      execute(setCardPriority, ctx, { boardId: "b1", cardId: "c1", priority: 4 });
    });

    const { container } = render(
      <BadgeRow card={card} labels={[]} config={["severity", "dueDate"]} />,
    );
    expect(screen.getByText("S2")).toBeInTheDocument();
    expect(screen.getByText("Jan 15")).toBeInTheDocument();
    // priority is set but NOT configured → not rendered
    expect(screen.queryByLabelText("Priority: Urgent")).not.toBeInTheDocument();
    // severity before due
    expect(container.textContent).toMatch(/S2.*Jan 15/);
  });

  it("emits nothing for a configured field the card lacks", () => {
    const card = makeCard(); // priority None, severity null
    const { container } = render(
      <BadgeRow card={card} labels={[]} config={["priority", "severity"]} />,
    );
    expect(container.textContent).toBe("");
  });

  it("reordering the config reorders the badges", () => {
    const card = makeCard((ctx) => {
      execute(setCardSeverity, ctx, { boardId: "b1", cardId: "c1", severity: 2 });
      execute(setCardDueDate, ctx, {
        boardId: "b1",
        cardId: "c1",
        dueDate: { at: new Date(2027, 0, 15).getTime(), hasTime: false },
      });
    });
    const { container } = render(
      <BadgeRow card={card} labels={[]} config={["dueDate", "severity"]} />,
    );
    expect(container.textContent).toMatch(/Jan 15.*S2/);
  });
});

describe("BadgeConfig", () => {
  it("toggling a field off removes it from the board config", () => {
    const ctx = createMemoryContext();
    execute(createBoard, ctx, { id: "b1", title: "Board" });
    render(
      <BoardlyProvider context={ctx}>
        <BadgeConfig boardId="b1" />
      </BoardlyProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Priority" }));
    expect(getBoard(ctx.getBoardDoc("b1"), "b1").badgeConfig).not.toContain("priority");
  });
});
