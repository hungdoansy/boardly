// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import { cardsInStatus, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { showAllColumns } from "../../lib/hidden-columns";
import { BoardView } from "./board-view";
import { ColumnsMenu } from "./columns-menu";

// The header's Columns menu is rendered alongside the board (as in the app) so
// the "Hide" item's effect on the trigger label can be asserted.
function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnsMenu />
      <BoardView />
    </BoardlyProvider>,
  );
  return { ctx };
}

afterEach(() => {
  cleanup();
  showAllColumns();
  localStorage.clear();
});

// Radix's dropdown trigger opens on pointerdown/keyboard, not a bare click. Each
// column has its own menu, so the trigger is addressed by status name.
function openColumnMenu(status: Status): void {
  fireEvent.keyDown(
    screen.getByRole("button", { name: `${STATUS_META[status].name} column actions` }),
    { key: "Enter" },
  );
}

const columnNames = (): (string | null)[] =>
  screen.queryAllByRole("region").map((r) => r.getAttribute("aria-label"));

describe("column menu — Hide", () => {
  it("renders a menu on every column, empty ones included", () => {
    setup(); // no cards anywhere
    for (const status of STATUS_ORDER) {
      expect(
        screen.getByRole("button", { name: `${STATUS_META[status].name} column actions` }),
      ).toBeInTheDocument();
    }
  });

  it("offers both Archive all and Hide on a populated column", async () => {
    setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
    });
    openColumnMenu(Status.InProgress);

    expect(await screen.findByRole("menuitem", { name: "Archive all" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Hide" })).toBeInTheDocument();
  });

  it("hides the column immediately, with no confirmation dialog", async () => {
    setup();
    openColumnMenu(Status.Duplicate);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hide" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(columnNames()).toHaveLength(STATUS_ORDER.length - 1);
    expect(columnNames()).not.toContain(`Column: ${STATUS_META[Status.Duplicate].name}`);
    expect(screen.getByRole("button", { name: "Columns, 1 hidden" })).toBeInTheDocument();
  });

  it("leaves the column's cards untouched — hiding is layout, not archiving", async () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
      execute(createCard, ctx, { status: Status.InProgress, title: "B" });
    });

    openColumnMenu(Status.InProgress);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Hide" }));

    const cards = cardsInStatus(ctx.getBoardDoc(), Status.InProgress);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => !c.archived)).toBe(true);
    expect(cards.every((c) => c.deletedAt === undefined)).toBe(true);
  });

  it("falls back to the empty state when the last visible column is hidden", async () => {
    setup();
    for (const status of STATUS_ORDER) {
      openColumnMenu(status);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Hide" }));
    }

    expect(columnNames()).toHaveLength(0);
    expect(screen.getByText("Every column is hidden.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all columns" }));
    expect(columnNames()).toHaveLength(STATUS_ORDER.length);
  });
});
