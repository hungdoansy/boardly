// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { archiveCard, createCard, execute } from "@boardly/commands";
import { addRelatedCard } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { getCard, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useCardById } from "../../lib/use-board";
import { CardRelated } from "./related";

function Harness({ cardId }: { cardId: string }) {
  const card = useCardById(cardId);
  return card ? <CardRelated card={card} /> : null;
}

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "Card One" });
  execute(createCard, ctx, { id: "c2", title: "Card Two" });
  execute(createCard, ctx, { id: "c3", title: "Card Three" });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <Harness cardId="c1" />
    </BoardlyProvider>,
  );
  return ctx;
}

const related = (ctx: MemoryContext) => getCard(ctx.getBoardDoc(), "c1")?.relatedIds ?? [];
const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Add related" }));
const search = () => screen.getByRole("textbox", { name: "Search cards to relate" });
const picker = () => within(screen.getByLabelText("Add related ticket"));

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("CardRelated", () => {
  it("adds a related card via the picker and renders a chip", () => {
    const ctx = setup();
    openPicker();
    fireEvent.change(search(), { target: { value: "Two" } });
    fireEvent.click(picker().getByText("Card Two"));

    expect(related(ctx)).toEqual(["c2"]);
    // The relation is symmetric on the other card too.
    expect(getCard(ctx.getBoardDoc(), "c2")?.relatedIds).toEqual(["c1"]);
    expect(screen.getByText("Card Two")).toBeInTheDocument();
  });

  it("removes a related card", () => {
    const ctx = setup((c) => execute(addRelatedCard, c, { cardId: "c1", relatedId: "c2" }));
    expect(related(ctx)).toEqual(["c2"]);
    fireEvent.click(screen.getByRole("button", { name: /remove relation to/i }));
    expect(related(ctx)).toEqual([]);
  });

  it("excludes self, already-related, and archived cards from the picker", () => {
    setup((c) => {
      execute(addRelatedCard, c, { cardId: "c1", relatedId: "c2" }); // already related
      execute(createCard, c, { id: "c4", title: "Card Four" });
      execute(archiveCard, c, { cardId: "c4" }); // archived
    });
    openPicker();
    fireEvent.change(search(), { target: { value: "Card" } });

    // Only the unrelated, non-archived, non-self card is offered.
    expect(picker().getByText("Card Three")).toBeInTheDocument();
    expect(picker().queryByText("Card Two")).not.toBeInTheDocument(); // already related
    expect(picker().queryByText("Card Four")).not.toBeInTheDocument(); // archived
    expect(picker().queryByText("Card One")).not.toBeInTheDocument(); // self
  });

  it("navigates to a related card when its chip is clicked", () => {
    setup((c) => execute(addRelatedCard, c, { cardId: "c1", relatedId: "c2" }));
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByText("Card Two"));
    // The setter writes the ticket hash for card 2.
    expect(window.location.hash).not.toBe("");
    expect(window.location.hash).toContain("2");
  });
});
