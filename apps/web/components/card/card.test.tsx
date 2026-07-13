// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addChecklistItem,
  addLink,
  assignLabel,
  createCard,
  createLabel,
  createProject,
  execute,
  setCardDueDate,
  setCardPriority,
  setCardProject,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { Status } from "@boardly/domain";
import { cardsInStatus, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { setFocusLevel } from "../../lib/focus-mode";
import { ColumnCards } from "../board/column-cards";

const STATUS = Status.Todo;

function setup(seed?: (ctx: MemoryContext, status: Status) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const onOpenCard = vi.fn();
  seed?.(ctx, STATUS);
  render(
    <BoardlyProvider context={ctx}>
      <ColumnCards status={STATUS} onOpenCard={onOpenCard} />
    </BoardlyProvider>,
  );
  return { ctx, status: STATUS, onOpenCard };
}

const composerInput = () => screen.getByRole("textbox", { name: "New card title" });

afterEach(() => {
  cleanup();
  setFocusLevel("off"); // reset the module-level focus store between tests
  localStorage.clear();
});

describe("cards", () => {
  it("quick-adds cards which append to the bottom of the column", () => {
    const { ctx, status } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));

    fireEvent.change(composerInput(), { target: { value: "First" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    fireEvent.change(composerInput(), { target: { value: "Second" } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(cardsInStatus(ctx.getBoardDoc(), status).map((c) => c.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("rejects a whitespace-only title", () => {
    const { ctx, status } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card" }));
    fireEvent.change(composerInput(), { target: { value: "   " } });
    fireEvent.keyDown(composerInput(), { key: "Enter" });
    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);
  });

  it("opens the card detail when a card is clicked", () => {
    const { onOpenCard } = setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "card-1", title: "Open me" });
    });
    fireEvent.click(screen.getByText("Open me"));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("opens the card detail when clicking the card body, not just the title", () => {
    const { onOpenCard } = setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "card-1", title: "Open me" });
    });
    // The ticket id is a non-title region; the whole face is clickable.
    fireEvent.click(screen.getByText("#1"));
    expect(onOpenCard).toHaveBeenCalledWith("card-1");
  });

  it("only creates a card via the 'with details' button once confirmed", () => {
    const { ctx, status, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Detailed card" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = cardsInStatus(ctx.getBoardDoc(), status);
    expect(created).toHaveLength(1);
    expect(created[0]!.title).toBe("Detailed card");
    expect(onOpenCard).toHaveBeenCalledWith(created[0]!.id);
  });

  it("creates nothing when the 'with details' dialog is cancelled", () => {
    const { ctx, status, onOpenCard } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add card with details" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New card title" }), {
      target: { value: "Never created" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(cardsInStatus(ctx.getBoardDoc(), status)).toHaveLength(0);
    expect(onOpenCard).not.toHaveBeenCalled();
  });

  it("collapses the card face to status only in Zen focus", () => {
    const seed = (ctx: MemoryContext, status: Status): void => {
      execute(createCard, ctx, { status, id: "c1", title: "Seeded" });
      execute(setCardPriority, ctx, { cardId: "c1", priority: 4 });
    };

    // Off: the priority badge shows.
    const off = setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority: Urgent")).toBeInTheDocument();
    cleanup();
    void off;

    // Zen: title stays, the priority badge is gone (config forced to status only).
    setFocusLevel("zen");
    setup(seed);
    expect(screen.getByText("Seeded")).toBeInTheDocument();
    expect(screen.queryByLabelText("Priority: Urgent")).not.toBeInTheDocument();
  });

  it("leads the card with the status glyph and shows the ticket id", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "Laid out" });
    });
    // Status glyph is rendered by hand at the head of the title row.
    expect(screen.getByLabelText(/^Status:/)).toBeInTheDocument();
    // Derived ticket id renders (empty prefix → `#1`).
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("renders many cards without error (perf sanity)", () => {
    setup((ctx, status) => {
      for (let i = 0; i < 500; i += 1) {
        execute(createCard, ctx, { status, title: `Card ${i}` });
      }
    });
    expect(screen.getAllByRole("article")).toHaveLength(500);
  });
});

describe("card face layout (Unit 5)", () => {
  /**
   * The article's metadata rows, in DOM order, with the title row (always at
   * index 1 — line 1 leads, then the title) spliced out.
   */
  function metaRows(article: HTMLElement): HTMLElement[] {
    const children = Array.from(article.children) as HTMLElement[];
    const [line1, , ...rest] = children;
    return [line1!, ...rest];
  }

  it("lays out ticket id + deadline/checklist, labels, and priority/links/project on their own lines", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "Full" });
      execute(setCardPriority, ctx, { cardId: "c1", priority: 4 });
      execute(setCardDueDate, ctx, {
        cardId: "c1",
        dueDate: { at: new Date(2027, 0, 15).getTime(), hasTime: false },
      });
      execute(addChecklistItem, ctx, { cardId: "c1", text: "step" });
      const label = execute(createLabel, ctx, { name: "Frontend" })!;
      execute(assignLabel, ctx, { cardId: "c1", labelId: label.id });
      execute(addLink, ctx, { cardId: "c1", url: "https://example.com/x" });
      const project = execute(createProject, ctx, { name: "Eng" })!;
      execute(setCardProject, ctx, { cardId: "c1", projectId: project.id });
    });

    const article = screen.getByRole("article", { name: "Card: Full" });
    const rows = metaRows(article);
    expect(rows).toHaveLength(3);

    // Line 1: ticket id (left) … deadline + checklist (right).
    expect(within(rows[0]!).getByText("#1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Jan 15")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("0/1")).toBeInTheDocument();
    expect(rows[0]!.textContent).toMatch(/#1.*Jan 15.*0\/1/);

    // Line 2: labels only.
    expect(within(rows[1]!).getByText("Frontend")).toBeInTheDocument();

    // Line 3: urgency (priority), then links, then the project badge, in order.
    const priorityEl = within(rows[2]!).getByLabelText("Priority: Urgent");
    const linksEl = within(rows[2]!).getByLabelText("1 link");
    const projectEl = within(rows[2]!).getByLabelText("Project: Eng");
    const order = Array.from(rows[2]!.children);
    expect(order.indexOf(priorityEl)).toBeLessThan(order.indexOf(linksEl));
    expect(order.indexOf(linksEl)).toBeLessThan(order.indexOf(projectEl));
  });

  it("omits the labels line entirely when the card has no labels", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "No labels" });
      execute(setCardPriority, ctx, { cardId: "c1", priority: 4 });
    });
    const article = screen.getByRole("article", { name: "Card: No labels" });
    const rows = metaRows(article);
    // Only line 1 (ticket id) and line 3 (priority) — no labels line between them.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).queryByLabelText("Priority: Urgent")).toBeInTheDocument();
  });

  it("still shows line 1 with just the ticket id when there is no due date or checklist", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "Bare" });
    });
    const article = screen.getByRole("article", { name: "Card: Bare" });
    const rows = metaRows(article);
    // Line 1 always renders (carries the ticket id); no line 2/3 without content.
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText("#1")).toBeInTheDocument();
  });

  it("omits line 3 entirely when there is no priority, links, or project", () => {
    setup((ctx, status) => {
      execute(createCard, ctx, { status, id: "c1", title: "No line 3" });
      const label = execute(createLabel, ctx, { name: "Bug" })!;
      execute(assignLabel, ctx, { cardId: "c1", labelId: label.id });
    });
    const article = screen.getByRole("article", { name: "Card: No line 3" });
    const rows = metaRows(article);
    // Line 1 (ticket id) and line 2 (labels) only.
    expect(rows).toHaveLength(2);
    expect(within(rows[1]!).getByText("Bug")).toBeInTheDocument();
  });
});
