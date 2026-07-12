// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute, setCardPriority } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status } from "@boardly/domain";
import { cardsInStatus, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { setFocusLevel } from "../../lib/focus-mode";
import { ColumnCards } from "../board/column-cards";

const STATUS = Status.Todo;

function setup(seed?: (ctx: MemoryContext, status: Status) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const onOpenCard = vi.fn();
  seed?.(ctx, STATUS);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnCards status={STATUS} onOpenCard={onOpenCard} />
    </BoardlyProvider>,
  );
  return { ctx, status: STATUS, onOpenCard };
}

const composerInput = () => screen.getByRole("textbox", { name: "New card title" });

afterEach(() => {
  cleanup();
  setFocusLevel("off"); // reset the module-level focus store between tests
  localStorage.clear();
});

describe("cards", () => {
  it("quick-adds cards which append to the bottom of the column", () => {
    const { ctx, status } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

    fireEvent.change(composerInput(), { target: { value: "First" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    fireEvent.change(composerInput(), { target: { value: "Second" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(cardsInStatus(ctx.getBoardDoc(), status).map((c) => c.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("rejects a whitespace-only title", () => {
    const { ctx, status } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(composerInput(), { target: { value: "   " } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);
  });

  it("opens the card detail when a card is clicked", () => {
    const { onOpenCard } = setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "card-1", title: "Open me" });
    });
    fireEvent.click(screen.getByText("Open me"));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("only creates a card via the 'with details' button once confirmed", () => {
    const { ctx, status, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Detailed card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = cardsInStatus(ctx.getBoardDoc(), status);
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("Detailed card");
    expect(onOpenCard).toHaveBeenCalledWith(created[0]!.id);
  });

  it("creates nothing when the 'with details' dialog is cancelled", () => {
    const { ctx, status, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Never created" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it("archives a card", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, title: "Bye" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive Bye" }));
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("collapses the card face to status only in Zen focus", () => {
    const seed = (ctx: MemoryContext, status: Status): void => {
      execute(createCard, ctx, { status, id: "c1", title: "Seeded" });
      execute(setCardPriority, ctx, { cardId: "c1", priority: 4 });
    };

    // Off: the priority badge shows.
    const off = setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority: Urgent")).toBeInTheDocument();
    cleanup();
    void off;

    // Zen: title stays, the priority badge is gone (config forced to status only).
    setFocusLevel("zen");
    setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.queryByLabelText("Priority: Urgent")).not.toBeInTheDocument();
  });

  it("leads the card with the status glyph and shows the ticket id", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "Laid out" });
    });
    // Status glyph is rendered by hand at the head of the title row.
    expect(screen.getByLabelText(/^Status:/)).toBeInTheDocument();
    // Derived ticket id renders (empty prefix → `#1`).
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("renders many cards without error (perf sanity)", () => {
    setup((ctx, status) => {
      for (let i = 0; i < 500; i += 1) {
        execute(createCard, ctx, { status, title: `Card ${i}` });
      }
    });
    expect(screen.getAllByRole("article")).toHaveLength(500);
  });
});
