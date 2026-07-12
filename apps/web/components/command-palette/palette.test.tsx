// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn, createMemoryContext, execute } from "@boardly/commands";
import { cardsInColumn, initBoard, liveColumns } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CommandPalette } from "./palette";

/** Render the palette over a memory context, optionally seeding the one board. */
function renderPalette(seedBoard = true) {
  const ctx = createMemoryContext();
  if (seedBoard) {
    initBoard(ctx.getBoardDoc(), { title: "Main board", now: 0 });
    execute(addColumn, ctx, { title: "To Do" });
  }
  render(
    <BoardlyProvider context={ctx}>
      <CommandPalette />
    </BoardlyProvider>,
  );
  return ctx;
}

function pressCmdK() {
  fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true });
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("CommandPalette", () => {
  it("is closed until ⌘K is pressed, then shows commands", () => {
    renderPalette();
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();

    pressCmdK();
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it("offers no board-creation command (Boardly is single-board)", () => {
    renderPalette();
    pressCmdK();
    expect(screen.queryByText("Create board")).not.toBeInTheDocument();
    expect(screen.queryByText(/jump to board/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the query", () => {
    renderPalette();
    pressCmdK();
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), {
      target: { value: "zzzznotacommand" },
    });
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("offers a 'new card' action for the single board and creates in the first column", () => {
    const ctx = renderPalette();
    pressCmdK();
    fireEvent.click(screen.getByText(/new card in/i));

    const boardDoc = ctx.getBoardDoc();
    const firstColumn = liveColumns(boardDoc)[0]!;
    expect(cardsInColumn(boardDoc, firstColumn.id)).toHaveLength(1);
  });
});
