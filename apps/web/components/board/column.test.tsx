// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import { getBoard, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <BoardView />
    </BoardlyProvider>,
  );
  return { ctx };
}

afterEach(() => {
  cleanup();
});

describe("BoardView fixed status columns", () => {
  it("renders exactly the eight status columns in STATUS_ORDER", () => {
    setup();
    const columns = screen.getAllByRole("region");
    expect(columns).toHaveLength(STATUS_ORDER.length);
    expect(columns.map((c) => c.getAttribute("aria-label"))).toEqual(
      STATUS_ORDER.map((s) => `Column: ${STATUS_META[s].name}`),
    );
  });

  it("has no add-column control and no editable headers", () => {
    setup();
    expect(screen.queryByRole("button", { name: /add column/i })).not.toBeInTheDocument();
    // Double-clicking a header does not open a rename input (columns are fixed).
    fireEvent.dblClick(screen.getByText("Todo"));
    expect(screen.queryByRole("textbox", { name: "Column name" })).not.toBeInTheDocument();
  });

  it("hides zero-card columns when 'hide empty' is toggled, and persists the flag", () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "Only one" });
    });

    // All eight visible while showEmptyColumns is on (the default).
    expect(screen.getAllByRole("region")).toHaveLength(STATUS_ORDER.length);

    fireEvent.click(screen.getByRole("button", { name: "Hide empty columns" }));

    // Command persisted the flag to board meta, and only the populated column shows.
    expect(getBoard(ctx.getBoardDoc(), "me").showEmptyColumns).toBe(false);
    const visible = screen.getAllByRole("region");
    expect(visible).toHaveLength(1);
    expect(visible[0]!.getAttribute("aria-label")).toBe(
      `Column: ${STATUS_META[Status.InProgress].name}`,
    );

    // Turning it back on restores all eight.
    fireEvent.click(screen.getByRole("button", { name: "Show empty columns" }));
    expect(getBoard(ctx.getBoardDoc(), "me").showEmptyColumns).toBe(true);
    expect(screen.getAllByRole("region")).toHaveLength(STATUS_ORDER.length);
  });
});
