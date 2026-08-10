// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  archiveProject,
  createCard,
  createMemoryContext,
  createProject,
  execute,
} from "@boardly/commands";
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

/**
 * A board with a visible project, a hidden one holding a card, and nothing else
 * — the only shape in which the include-hidden toggle exists (UNIT-20).
 */
function renderPaletteWithHiddenProject() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Main board", now: 0 });
  execute(createProject, ctx, { id: "pweb", name: "Web" });
  execute(createProject, ctx, { id: "plegacy", name: "Legacy" });
  execute(createCard, ctx, { title: "Ship the picker", projectId: "pweb" });
  execute(createCard, ctx, { title: "Retire the cron", projectId: "plegacy" });
  execute(archiveProject, ctx, { projectId: "plegacy" });
  render(
    <BoardlyProvider context={ctx}>
      <CommandPalette onGoToProject={vi.fn()} onShowShortcuts={vi.fn()} />
    </BoardlyProvider>,
  );
  return { ctx };
}

function pressCmdK() {
  fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true });
}

const paletteInput = () => screen.getByPlaceholderText(/type a command/i);
const typeQuery = (value: string) => fireEvent.change(paletteInput(), { target: { value } });
const toggleRow = () => screen.getByRole("option", { name: /include hidden projects/i });

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

describe("CommandPalette — hidden projects (UNIT-20)", () => {
  it("drops a hidden project's cards but keeps the toggle row under a query", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    typeQuery("retire");

    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
    expect(screen.getByText("No results.")).toBeInTheDocument();
    // The whole reason the row is force-mounted: cmdk unmounts an ordinary item
    // that doesn't score against the query, which would remove the one control
    // that can answer "why is there no result?" exactly when it is needed.
    expect(toggleRow()).toBeInTheDocument();
  });

  it("reveals the card, marked with its project, when the toggle is activated", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    typeQuery("retire");

    fireEvent.keyDown(paletteInput(), { key: "ArrowDown" });
    expect(toggleRow()).toHaveAttribute("data-selected", "true");
    fireEvent.keyDown(paletteInput(), { key: "Enter" });

    const row = screen.getByRole("option", { name: /retire the cron/i });
    expect(row).toHaveTextContent("Legacy");
    // The glyph alone would encode the distinction visually (DESIGN.md §9).
    expect(row).toHaveTextContent("Hidden project");
    // Activating the toggle must not close the palette — the result it reveals
    // is the point.
    expect(paletteInput()).toBeInTheDocument();
  });

  it("exposes the toggle as a checkable option and stays open when it is clicked", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    expect(toggleRow()).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggleRow());
    expect(toggleRow()).toHaveAttribute("aria-checked", "true");
    expect(paletteInput()).toBeInTheDocument();
  });

  it("is reachable from the input by arrow keys", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    for (let i = 0; i < 12 && toggleRow().getAttribute("data-selected") !== "true"; i++) {
      fireEvent.keyDown(paletteInput(), { key: "ArrowDown" });
    }
    expect(toggleRow()).toHaveAttribute("data-selected", "true");
  });

  it("resets the toggle when the palette is reopened after Escape", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    fireEvent.click(toggleRow());
    typeQuery("retire");
    expect(screen.getByText("Retire the cron")).toBeInTheDocument();

    fireEvent.keyDown(paletteInput(), { key: "Escape" });
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();

    pressCmdK();
    expect(toggleRow()).toHaveAttribute("aria-checked", "false");
    typeQuery("retire");
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
  });

  it("resets the toggle when the palette is closed with ⌘K", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    fireEvent.click(toggleRow());
    expect(toggleRow()).toHaveAttribute("aria-checked", "true");

    // ⌘K is the close route that bypasses the palette's own close handler, so a
    // reset hung off that handler alone would not fire here.
    pressCmdK();
    pressCmdK();
    expect(toggleRow()).toHaveAttribute("aria-checked", "false");
  });

  it("never matches a card on its marker's project name", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    fireEvent.click(toggleRow());
    typeQuery("Legacy");

    // The marker names the project on screen, but the name stays out of cmdk's
    // `value` — otherwise typing it would surface every card the project holds.
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
  });

  it("opens a revealed hidden-project card on select", () => {
    renderPaletteWithHiddenProject();
    pressCmdK();
    fireEvent.click(toggleRow());
    typeQuery("retire");
    fireEvent.click(screen.getByText("Retire the cron"));

    expect(window.location.hash).toBe("#2-retire-the-cron");
  });

  it("omits the toggle row entirely on a board with no hidden projects", () => {
    renderPalette();
    pressCmdK();

    expect(
      screen.queryByRole("option", { name: /include hidden projects/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /new card/i })).toBeInTheDocument();
  });
});
