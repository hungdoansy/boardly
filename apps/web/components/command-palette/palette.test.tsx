// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext } from "@boardly/commands";
import { cardsInColumn, listBoards, liveColumns } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CommandPalette } from "./palette";

function renderPalette() {
  const ctx = createMemoryContext();
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
    expect(screen.getByText("Create board")).toBeInTheDocument();
  });

  it("creates a board through the command layer and closes", () => {
    const ctx = renderPalette();
    pressCmdK();
    fireEvent.click(screen.getByText("Create board"));

    expect(listBoards(ctx.getWorkspaceDoc())).toHaveLength(1);
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the query", () => {
    renderPalette();
    pressCmdK();
    fireEvent.change(screen.getByPlaceholderText(/type a command/i), {
      target: { value: "zzzznotacommand" },
    });
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("offers a 'new card' action once a board is selected and creates in the first column", () => {
    const ctx = renderPalette();
    // Create + select a board first.
    pressCmdK();
    fireEvent.click(screen.getByText("Create board"));
    const board = listBoards(ctx.getWorkspaceDoc())[0]!;
    // useSelectedBoard reads the hash; the create action selects the new board.
    fireEvent(window, new HashChangeEvent("hashchange"));

    pressCmdK();
    const newCard = screen.getByText(/new card in/i);
    fireEvent.click(newCard);

    const boardDoc = ctx.getBoardDoc(board.id);
    const firstColumn = liveColumns(boardDoc)[0]!;
    expect(cardsInColumn(boardDoc, firstColumn.id)).toHaveLength(1);
  });
});
