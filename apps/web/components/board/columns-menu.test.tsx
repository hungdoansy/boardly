// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute, setCardStatus } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { type Filter, Status, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import { cardsInStatus, getBoard, initBoard } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { showAllColumns } from "../../lib/hidden-columns";
import { BoardView } from "./board-view";

function setup(seed?: (ctx: MemoryContext) => void, filter?: Filter) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <BoardView filter={filter} />
    </BoardlyProvider>,
  );
  return { ctx };
}

afterEach(() => {
  cleanup();
  // Module singleton — without this, a hide leaks into the next test.
  showAllColumns();
  localStorage.clear();
});

// Radix's dropdown trigger opens on pointerdown/keyboard, not a bare click.
function openMenu(): void {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Columns/ }), { key: "Enter" });
}

// The menu is modal, so it `aria-hidden`s the board — column assertions have to
// wait until it is closed.
function closeMenu(): void {
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
}

const columnNames = (): (string | null)[] =>
  screen.queryAllByRole("region").map((r) => r.getAttribute("aria-label"));

const statusRow = (status: Status): HTMLElement =>
  screen.getByRole("menuitemcheckbox", { name: new RegExp(`^${STATUS_META[status].name}`) });

describe("Columns menu", () => {
  it("lists all eight statuses with their filter-aware counts", async () => {
    setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
      execute(createCard, ctx, { status: Status.InProgress, title: "B" });
      execute(createCard, ctx, { status: Status.Backlog, title: "C" });
    });

    openMenu();
    await screen.findByRole("menu");

    const rows = screen.getAllByRole("menuitemcheckbox");
    // Eight statuses + the "Show empty columns" toggle.
    expect(rows).toHaveLength(STATUS_ORDER.length + 1);
    expect(rows.slice(0, 8).map((r) => within(r).getByText(/^[A-Z]/).textContent)).toEqual(
      STATUS_ORDER.map((s) => STATUS_META[s].name),
    );
    expect(within(statusRow(Status.InProgress)).getByText("2")).toBeInTheDocument();
    expect(within(statusRow(Status.Backlog)).getByText("1")).toBeInTheDocument();
    expect(within(statusRow(Status.Done)).getByText("0")).toBeInTheDocument();
  });

  it("hides a column when its row is unchecked, and advertises the count on the trigger", async () => {
    setup();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /^Duplicate/ }));
    closeMenu();

    expect(columnNames()).toHaveLength(STATUS_ORDER.length - 1);
    expect(columnNames()).not.toContain(`Column: ${STATUS_META[Status.Duplicate].name}`);
    expect(screen.getByRole("button", { name: "Columns, 1 hidden" })).toHaveTextContent(
      "Columns · 1 hidden",
    );
  });

  it("restores a column at its STATUS_ORDER position, not appended last", async () => {
    setup();
    openMenu();
    // Backlog is first in STATUS_ORDER — appending would put it last on return.
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /^Backlog/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^Backlog/ }));
    closeMenu();

    expect(columnNames()).toEqual(STATUS_ORDER.map((s) => `Column: ${STATUS_META[s].name}`));
  });

  it("stays open across several toggles", async () => {
    setup();
    openMenu();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /^Backlog/ }));
    expect(screen.getByRole("menu")).toBeVisible();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^Duplicate/ }));
    expect(screen.getByRole("menu")).toBeVisible();
    closeMenu();

    expect(columnNames()).toHaveLength(STATUS_ORDER.length - 2);
  });

  it("disables 'Show all columns' until something is hidden, then restores everything", async () => {
    setup();
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Show all columns" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^Backlog/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /^Todo/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show all columns" }));

    expect(columnNames()).toHaveLength(STATUS_ORDER.length);
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument();
  });

  it("keeps a hidden column hidden when the show-empty toggle is cycled (hiding wins)", async () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
    });

    openMenu();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /^Backlog/ }));
    // Off, then back on.
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Show empty columns/ }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Show empty columns/ }));
    closeMenu();

    expect(getBoard(ctx.getBoardDoc(), "me").showEmptyColumns).toBe(true);
    expect(columnNames()).toHaveLength(STATUS_ORDER.length - 1);
    expect(columnNames()).not.toContain(`Column: ${STATUS_META[Status.Backlog].name}`);
  });

  it("does not resurrect a hidden column when a card lands in it", async () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.Todo, title: "Mover" });
    });
    const cardId = cardsInStatus(ctx.getBoardDoc(), Status.Todo)[0]!.id;

    openMenu();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /^Backlog/ }));
    closeMenu();

    act(() => {
      execute(setCardStatus, ctx, { cardId, status: Status.Backlog });
    });

    // Column still gone — but the menu now reports the card, which is the whole
    // discovery story for "where did it go?".
    expect(columnNames()).not.toContain(`Column: ${STATUS_META[Status.Backlog].name}`);
    openMenu();
    expect(within(statusRow(Status.Backlog)).getByText("1")).toBeInTheDocument();
  });

  it("renders an empty state with a restore button when every column is hidden", async () => {
    setup();
    openMenu();
    await screen.findByRole("menu");
    for (const status of STATUS_ORDER) {
      fireEvent.click(
        screen.getByRole("menuitemcheckbox", { name: new RegExp(`^${STATUS_META[status].name}`) }),
      );
    }
    closeMenu();

    expect(columnNames()).toHaveLength(0);
    expect(screen.getByText("Every column is hidden.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all columns" }));
    expect(columnNames()).toHaveLength(STATUS_ORDER.length);
  });

  it("shows zero counts under a filter that excludes everything, and stays toggleable", async () => {
    const excludeAll: Filter = {
      op: "and",
      clauses: [{ field: "title", condition: "contains", values: ["zzz-no-match"] }],
    };
    setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
    }, excludeAll);

    openMenu();
    await screen.findByRole("menu");
    for (const status of STATUS_ORDER) {
      expect(within(statusRow(status)).getByText("0")).toBeInTheDocument();
    }

    fireEvent.click(statusRow(Status.Backlog));
    closeMenu();
    expect(columnNames()).not.toContain(`Column: ${STATUS_META[Status.Backlog].name}`);
  });
});
