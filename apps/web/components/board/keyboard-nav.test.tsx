// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type BoardLayout,
  type Focus,
  focusAfterRemoval,
  initialFocus,
  moveFocus,
  useBoardKeyboardNav,
} from "./keyboard-nav";

const LAYOUT: BoardLayout = {
  columns: ["c1", "c2", "c3"],
  cards: { c1: ["a", "b"], c2: ["x"], c3: [] },
};

describe("moveFocus (pure)", () => {
  const at = (columnId: string, cardId: string | null): Focus => ({ columnId, cardId });

  it("walks cards down and stops at the last card", () => {
    expect(moveFocus(LAYOUT, at("c1", "a"), "down")).toEqual(at("c1", "b"));
    expect(moveFocus(LAYOUT, at("c1", "b"), "down")).toBeNull();
  });

  it("walks up and steps onto the column header above the first card", () => {
    expect(moveFocus(LAYOUT, at("c1", "b"), "up")).toEqual(at("c1", "a"));
    expect(moveFocus(LAYOUT, at("c1", "a"), "up")).toEqual(at("c1", null));
    expect(moveFocus(LAYOUT, at("c1", null), "up")).toBeNull();
  });

  it("moves between columns preserving the row, clamped to the target length", () => {
    // c1 row 1 → c2 has only row 0 → clamps to "x".
    expect(moveFocus(LAYOUT, at("c1", "b"), "right")).toEqual(at("c2", "x"));
    // c2 → c3 is empty → land on its header.
    expect(moveFocus(LAYOUT, at("c2", "x"), "right")).toEqual(at("c3", null));
    // back left preserves position.
    expect(moveFocus(LAYOUT, at("c2", "x"), "left")).toEqual(at("c1", "a"));
  });

  it("clamps at the horizontal edges (no wrap)", () => {
    expect(moveFocus(LAYOUT, at("c1", "a"), "left")).toBeNull();
    expect(moveFocus(LAYOUT, at("c3", null), "right")).toBeNull();
  });

  it("carries a header across columns as a header", () => {
    expect(moveFocus(LAYOUT, at("c1", null), "right")).toEqual(at("c2", null));
  });
});

describe("initialFocus / focusAfterRemoval (pure)", () => {
  it("picks the first column's first card, or its header when empty", () => {
    expect(initialFocus(LAYOUT)).toEqual({ columnId: "c1", cardId: "a" });
    expect(initialFocus({ columns: ["c3"], cards: { c3: [] } })).toEqual({
      columnId: "c3",
      cardId: null,
    });
    expect(initialFocus({ columns: [], cards: {} })).toBeNull();
  });

  it("lands on the next card, then the previous, then the header", () => {
    expect(focusAfterRemoval(LAYOUT, { columnId: "c1", cardId: "a" })).toEqual({
      columnId: "c1",
      cardId: "b",
    });
    expect(focusAfterRemoval(LAYOUT, { columnId: "c1", cardId: "b" })).toEqual({
      columnId: "c1",
      cardId: "a",
    });
    expect(focusAfterRemoval(LAYOUT, { columnId: "c2", cardId: "x" })).toEqual({
      columnId: "c2",
      cardId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: the hook wired to a fixture board with data-nav-* markup.
// ---------------------------------------------------------------------------

function Fixture(props: {
  onOpenCard: (id: string) => void;
  onArchiveCard: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onAddCard: (columnId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useBoardKeyboardNav(ref, props);
  return (
    <div ref={ref}>
      <section data-nav-column="c1" aria-label="Column: To Do">
        <button data-nav="column" data-column-id="c1">
          To Do
        </button>
        <div data-nav="card" data-card-id="a" data-column-id="c1" tabIndex={0}>
          A
        </div>
        <div data-nav="card" data-card-id="b" data-column-id="c1" tabIndex={0}>
          B
        </div>
        <button data-nav-composer onClick={() => props.onAddCard("c1")}>
          Add card
        </button>
      </section>
      <section data-nav-column="c2" aria-label="Column: Doing">
        <button data-nav="column" data-column-id="c2">
          Doing
        </button>
        <div data-nav="card" data-card-id="x" data-column-id="c2" tabIndex={0}>
          X
        </div>
        <button data-nav-composer onClick={() => props.onAddCard("c2")}>
          Add card
        </button>
      </section>
    </div>
  );
}

function renderFixture() {
  const handlers = {
    onOpenCard: vi.fn(),
    onArchiveCard: vi.fn(),
    onCyclePriority: vi.fn(),
    onAddCard: vi.fn(),
  };
  render(<Fixture {...handlers} />);
  const card = (id: string): HTMLElement =>
    document.querySelector<HTMLElement>(`[data-nav="card"][data-card-id="${id}"]`)!;
  return { handlers, card };
}

afterEach(() => cleanup());

describe("useBoardKeyboardNav (integration)", () => {
  it("arrows rove focus across cards and columns", () => {
    const { card } = renderFixture();
    card("a").focus();

    fireEvent.keyDown(card("a"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(card("b"));

    fireEvent.keyDown(card("b"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(card("x"));

    fireEvent.keyDown(card("x"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(card("a"));
  });

  it("Enter opens the focused card; p cycles priority; e archives", () => {
    const { handlers, card } = renderFixture();
    card("a").focus();

    fireEvent.keyDown(card("a"), { key: "Enter" });
    expect(handlers.onOpenCard).toHaveBeenCalledWith("a");

    fireEvent.keyDown(card("a"), { key: "p" });
    expect(handlers.onCyclePriority).toHaveBeenCalledWith("a");

    fireEvent.keyDown(card("a"), { key: "e" });
    expect(handlers.onArchiveCard).toHaveBeenCalledWith("a");
  });

  it("c clicks the focused column's composer (which opens its input in the real UI)", () => {
    const { handlers, card } = renderFixture();
    card("a").focus();

    fireEvent.keyDown(card("a"), { key: "c" });
    expect(handlers.onAddCard).toHaveBeenCalledWith("c1");
    expect(handlers.onAddCard).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts while typing in a field and while a modifier is held", () => {
    const { handlers, card } = renderFixture();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "e" });
    expect(handlers.onArchiveCard).not.toHaveBeenCalled();

    card("a").focus();
    fireEvent.keyDown(card("a"), { key: "e", metaKey: true });
    expect(handlers.onArchiveCard).not.toHaveBeenCalled();
    input.remove();
  });
});
