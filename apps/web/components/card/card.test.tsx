// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createCard,
  execute,
  setCardSeverity,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { cardsInColumn, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { setFocusLevel } from "../../lib/focus-mode";
import { ColumnCards } from "../board/column-cards";

function setup(seed?: (ctx: MemoryContext, columnId: string) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const column = execute(addColumnCmd, ctx, { title: "To Do" });
  const onOpenCard = vi.fn();
  seed?.(ctx, column.id);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnCards columnId={column.id} onOpenCard={onOpenCard} />
    </BoardlyProvider>,
  );
  return { ctx, columnId: column.id, onOpenCard };
}

const composerInput = () => screen.getByRole("textbox", { name: "New card title" });

afterEach(() => {
  cleanup();
  setFocusLevel("off"); // reset the module-level focus store between tests
  localStorage.clear();
});

describe("cards", () => {
  it("quick-adds cards which append to the bottom of the column", () => {
    const { ctx, columnId } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

    fireEvent.change(composerInput(), { target: { value: "First" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    fireEvent.change(composerInput(), { target: { value: "Second" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(cardsInColumn(ctx.getBoardDoc(), columnId).map((c) => c.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("rejects a whitespace-only title", () => {
    const { ctx, columnId } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(composerInput(), { target: { value: "   " } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    expect(cardsInColumn(ctx.getBoardDoc(), columnId)).toHaveLength(0);
  });

  it("opens the card detail when a card is clicked", () => {
    const { onOpenCard } = setup((ctx, columnId) => {
      execute(createCard, ctx, { columnId, id: "card-1", title: "Open me" });
    });
    fireEvent.click(screen.getByText("Open me"));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("only creates a card via the 'with details' button once confirmed", () => {
    const { ctx, columnId, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    expect(cardsInColumn(ctx.getBoardDoc(), columnId)).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Detailed card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = cardsInColumn(ctx.getBoardDoc(), columnId);
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("Detailed card");
    expect(onOpenCard).toHaveBeenCalledWith(created[0]!.id);
  });

  it("creates nothing when the 'with details' dialog is cancelled", () => {
    const { ctx, columnId, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Never created" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cardsInColumn(ctx.getBoardDoc(), columnId)).toHaveLength(0);
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it("archives a card", () => {
    setup((ctx, columnId) => {
      execute(createCard, ctx, { columnId, title: "Bye" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive Bye" }));
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });

  it("collapses the card face to status only in Zen focus", () => {
    const seed = (ctx: MemoryContext, columnId: string): void => {
      execute(createCard, ctx, { columnId, id: "c1", title: "Seeded" });
      execute(setCardSeverity, ctx, { cardId: "c1", severity: 2 });
    };

    // Off: the severity badge shows.
    const off = setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.getByText("S2")).toBeInTheDocument();
    cleanup();
    void off;

    // Zen: title stays, the severity badge is gone (config forced to status only).
    setFocusLevel("zen");
    setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.queryByText("S2")).not.toBeInTheDocument();
  });

  it("renders many cards without error (perf sanity)", () => {
    setup((ctx, columnId) => {
      for (let i = 0; i < 500; i += 1) {
        execute(createCard, ctx, { columnId, title: `Card ${i}` });
      }
    });
    expect(screen.getAllByRole("article")).toHaveLength(500);
  });
});
