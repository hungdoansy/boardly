// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { Card } from "@boardly/domain";
import {
  createCard,
  execute,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { getBoard, getCard, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BadgeConfig } from "../board/badge-config";
import { BadgeRow } from "./badge-row";

function makeCard(mutate?: (ctx: MemoryContext) => void): Card {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "Card" });
  mutate?.(ctx);
  return getCard(ctx.getBoardDoc(), "c1")!;
}

afterEach(() => {
  cleanup();
});

describe("BadgeRow", () => {
  it("renders only configured fields, in configured order", () => {
    const card = makeCard((ctx) => {
      execute(setCardSeverity, ctx, { cardId: "c1", severity: 2 });
      execute(setCardDueDate, ctx, {
        cardId: "c1",
        dueDate: { at: new Date(2027, 0, 15).getTime(), hasTime: false },
      });
      execute(setCardPriority, ctx, { cardId: "c1", priority: 4 });
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
      execute(setCardSeverity, ctx, { cardId: "c1", severity: 2 });
      execute(setCardDueDate, ctx, {
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
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
    render(
      <BoardlyProvider context={ctx}>
        <BadgeConfig />
      </BoardlyProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Priority" }));
    expect(getBoard(ctx.getBoardDoc(), "me").badgeConfig).not.toContain("priority");
  });
});
