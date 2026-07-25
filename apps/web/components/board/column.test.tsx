// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute, setCardStatus } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import { cardsInStatus, getBoard, initBoard } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardView } from "./board-view";
import { BoardColumn } from "./column";

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

  it("reacts to an in-session status change while hiding empty columns", () => {
    // Regression: card counts subscribe to nested Y.Map status changes (deep),
    // so moving a card re-derives which columns are non-empty without a reload.
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.Todo, title: "Mover" });
    });
    const cardId = cardsInStatus(ctx.getBoardDoc(), Status.Todo)[0]!.id;

    fireEvent.click(screen.getByRole("button", { name: "Hide empty columns" }));
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getByRole("region").getAttribute("aria-label")).toBe(
      `Column: ${STATUS_META[Status.Todo].name}`,
    );

    // Move the card's status; the only visible column must follow it to In Progress.
    // Wrap the external Yjs mutation in act so the useY-driven re-render flushes.
    act(() => {
      execute(setCardStatus, ctx, { cardId, status: Status.InProgress });
    });

    const visible = screen.getAllByRole("region");
    expect(visible).toHaveLength(1);
    expect(visible[0]!.getAttribute("aria-label")).toBe(
      `Column: ${STATUS_META[Status.InProgress].name}`,
    );
  });
});

describe("BoardColumn header", () => {
  function todoColumn(): HTMLElement {
    return screen.getByRole("region", { name: `Column: ${STATUS_META[Status.Todo].name}` });
  }

  it("renders the live count immediately after the column name", () => {
    setup((ctx) => {
      execute(createCard, ctx, { status: Status.Todo, title: "One" });
      execute(createCard, ctx, { status: Status.Todo, title: "Two" });
    });
    // Name and count share the header group; scope to <header> so card ticket
    // ids in the body can't be mistaken for the count.
    const header = todoColumn().querySelector("header")!;
    expect(header).toHaveTextContent(STATUS_META[Status.Todo].name);
    expect(header).toHaveTextContent("2");
  });

  it("opens the column's inline composer from the header add-card button", () => {
    setup();
    const col = todoColumn();
    // Header "+" is the first "Add card" button in the column (footer has one too).
    const addButtons = within(col).getAllByRole("button", { name: "Add card" });
    fireEvent.click(addButtons[0]!);
    expect(within(col).getByRole("textbox", { name: /new card title/i })).toBeInTheDocument();
  });

  it("still opens the composer with the 'c' shortcut after the header rework", () => {
    setup();
    const col = todoColumn();
    const navTarget = col.querySelector<HTMLElement>('[data-nav="column"]')!;
    navTarget.focus();
    fireEvent.keyDown(navTarget, { code: "KeyC", key: "c" });
    expect(within(col).getByRole("textbox", { name: /new card title/i })).toBeInTheDocument();
  });
});

describe("column archive menu", () => {
  // Radix's dropdown trigger opens on pointerdown/keyboard, not a bare click.
  const openMenu = (): void => {
    fireEvent.keyDown(screen.getByRole("button", { name: "Column actions" }), { key: "Enter" });
  };

  it("archives every visible card in a column via the 3-dots menu + confirm", async () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
      execute(createCard, ctx, { status: Status.InProgress, title: "B" });
    });

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive all" }));

    // Confirmation names the count and the column.
    expect(
      await screen.findByRole("heading", {
        name: `Archive all 2 cards in ${STATUS_META[Status.InProgress].name}?`,
      }),
    ).toBeVisible();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Archive all" }));
    });

    expect(cardsInStatus(ctx.getBoardDoc(), Status.InProgress)).toHaveLength(0);
  });

  it("shows no menu on an empty column (nothing to archive)", () => {
    setup(); // no cards anywhere
    expect(screen.queryByRole("button", { name: "Column actions" })).not.toBeInTheDocument();
  });

  it("archives nothing when the confirmation is cancelled", async () => {
    const { ctx } = setup((ctx) => {
      execute(createCard, ctx, { status: Status.InProgress, title: "A" });
    });

    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive all" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(cardsInStatus(ctx.getBoardDoc(), Status.InProgress)).toHaveLength(1);
  });
});

describe("BoardColumn drop feedback", () => {
  afterEach(() => cleanup());

  it("expands an accent drop zone only while hovered AND empty", () => {
    const { container, rerender } = render(<BoardColumn status={Status.Todo} count={0} isOver />);
    expect(container.querySelector("[data-drop-zone]")).toBeInTheDocument();
    expect(container.querySelector("section[data-over]")).toBeInTheDocument();

    // Not hovered → no zone, no over marker.
    rerender(<BoardColumn status={Status.Todo} count={0} />);
    expect(container.querySelector("[data-drop-zone]")).not.toBeInTheDocument();
    expect(container.querySelector("section[data-over]")).not.toBeInTheDocument();

    // Hovered but populated → over marker (ring) but no expanded zone.
    rerender(<BoardColumn status={Status.Todo} count={3} isOver />);
    expect(container.querySelector("section[data-over]")).toBeInTheDocument();
    expect(container.querySelector("[data-drop-zone]")).not.toBeInTheDocument();
  });
});
