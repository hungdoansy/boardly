// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext } from "@boardly/commands";
import { Status, STATUS_ORDER } from "@boardly/domain";
import { allLiveCards, cardsInStatus, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CommandPalette } from "./palette";

/** Render the palette over a memory context, optionally seeding the one board. */
function renderPalette(seedBoard = true) {
  const ctx = createMemoryContext();
  if (seedBoard) {
    initBoard(ctx.getBoardDoc(), { title: "Main board", now: 0 });
  }
  const onGoToProject = vi.fn();
  const onShowShortcuts = vi.fn();
  render(
    <BoardlyProvider context={ctx}>
      <CommandPalette onGoToProject={onGoToProject} onShowShortcuts={onShowShortcuts} />
    </BoardlyProvider>,
  );
  return { ctx, onGoToProject, onShowShortcuts };
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

  it("styles the selected row with the accent tint token, not the overlay/dialog background", () => {
    renderPalette();
    pressCmdK();
    const item = screen.getByRole("option", { name: /new card/i });
    // cmdk auto-selects the first item on open.
    expect(item).toHaveAttribute("data-selected", "true");
    expect(item.className).toContain("data-[selected=true]:bg-selected");
    expect(item.className).toContain("data-[selected=true]:border-l-[var(--accent)]");
    expect(item.className).not.toContain("data-[selected=true]:bg-overlay");
  });

  it("offers a 'new card' action that creates a card in the default (Todo) column", () => {
    const { ctx } = renderPalette();
    pressCmdK();
    fireEvent.click(screen.getByText(/new card/i));

    const boardDoc = ctx.getBoardDoc();
    expect(allLiveCards(boardDoc)).toHaveLength(1);
    // A card's column IS its status; a new card defaults to Todo.
    expect(cardsInStatus(boardDoc, Status.Todo)).toHaveLength(1);
    expect(STATUS_ORDER).toContain(Status.Todo);
  });

  it("'Go to project…' closes the palette and opens the switcher", () => {
    const { onGoToProject } = renderPalette();
    pressCmdK();
    fireEvent.click(screen.getByText(/go to project/i));
    expect(onGoToProject).toHaveBeenCalledTimes(1);
    // The palette closed as part of the hand-off.
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it("'Keyboard shortcuts' closes the palette and opens the overlay", () => {
    const { onShowShortcuts } = renderPalette();
    pressCmdK();
    fireEvent.click(screen.getByText(/keyboard shortcuts/i));
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });
});
