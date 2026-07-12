// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  addColumn as addColumnCmd,
  createCard,
  createMemoryContext,
  execute,
  type MemoryContext,
  setCardStatus,
} from "@boardly/commands";
import { type Card, type Filter, Priority, type ResolvedView, Status } from "@boardly/domain";
import { initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { ListBody, ListView } from "./list-view";

const NOW = new Date("2026-07-10T12:00:00Z").getTime();

function makeCard(over: Partial<Card>): Card {
  return {
    id: over.id ?? "c",
    number: 1,
    shortId: "#1",
    title: "Card",
    description: "",
    columnId: "col",
    ord: "a0",
    status: Status.Todo,
    priority: Priority.None,
    severity: null,
    dueDate: null,
    labelIds: [],
    checklist: [],
    links: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

// ---- Data path: the ListView container over a real (memory) board doc ----

function setup(
  seed: (ctx: MemoryContext, columnId: string) => void,
  props?: { groupBy?: "status" | "priority" | null; filter?: Filter },
) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const col = execute(addColumnCmd, ctx, { title: "Todo" });
  seed(ctx, col.id);
  render(
    <BoardlyProvider context={ctx}>
      <ListView groupBy={props?.groupBy ?? null} filter={props?.filter} />
    </BoardlyProvider>,
  );
  return { ctx, columnId: col.id };
}

const add = (ctx: MemoryContext, columnId: string, title: string) =>
  execute(createCard, ctx, { columnId, title })!;

afterEach(cleanup);

describe("ListView (data path)", () => {
  it("renders a flat list of rows in card order", () => {
    setup((ctx, col) => {
      add(ctx, col, "Alpha");
      add(ctx, col, "Beta");
      add(ctx, col, "Gamma");
    });
    expect(screen.getAllByRole("button").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
  });

  it("groups rows into sections with counts when grouped", () => {
    setup(
      (ctx, col) => {
        const a = add(ctx, col, "Doing it");
        const b = add(ctx, col, "Also doing");
        const c = add(ctx, col, "Done one");
        execute(setCardStatus, ctx, { cardId: a.id, status: Status.InProgress });
        execute(setCardStatus, ctx, { cardId: b.id, status: Status.InProgress });
        execute(setCardStatus, ctx, { cardId: c.id, status: Status.Done });
      },
      { groupBy: "status" },
    );
    expect(
      within(screen.getByRole("region", { name: "Group: In Progress" })).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Group: Done" })).getByText("1"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the filter", () => {
    setup((ctx, col) => add(ctx, col, "Hidden"), {
      filter: { op: "and", clauses: [{ field: "title", condition: "contains", values: ["zzz"] }] },
    });
    expect(screen.getByText(/no cards match/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hidden" })).not.toBeInTheDocument();
  });

  it("renders terminal cards struck through", () => {
    setup((ctx, col) => {
      const c = add(ctx, col, "Finished");
      execute(setCardStatus, ctx, { cardId: c.id, status: Status.Done });
    });
    expect(screen.getByText("Finished")).toHaveClass("line-through");
  });
});

// ---- Interaction: the pure ListBody with a spy (detail-open flow is e2e in V1.4) ----

const flat = (cards: Card[]): ResolvedView => ({ flat: cards });

describe("ListBody (interaction)", () => {
  const renderBody = (cards: Card[], onOpen = vi.fn()) => {
    render(
      <ListBody
        resolved={flat(cards)}
        labelById={new Map()}
        config={[]}
        groupBy={null}
        onOpen={onOpen}
      />,
    );
    return onOpen;
  };

  it("calls onOpen with the card id when a row is clicked", () => {
    const onOpen = renderBody([makeCard({ id: "a", title: "Alpha" })]);
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(onOpen).toHaveBeenCalledWith("a");
  });

  it("navigates rows with ArrowUp/Down and opens the focused row with Enter", () => {
    const onOpen = renderBody([
      makeCard({ id: "a", title: "First" }),
      makeCard({ id: "b", title: "Second" }),
    ]);
    const first = screen.getByRole("button", { name: "First" });
    const second = screen.getByRole("button", { name: "Second" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("a");
  });
});

describe("ListBody (Zen focus)", () => {
  const labelById = new Map([["l1", { id: "l1", name: "Frontend", color: "#4EA7FC", ord: "a0" }]]);
  const card = makeCard({ id: "a", title: "Alpha", severity: 2, labelIds: ["l1"] });
  const renderBody = (zen: boolean) =>
    render(
      <ListBody
        resolved={flat([card])}
        labelById={labelById}
        config={["status", "severity", "labels"]}
        groupBy={null}
        zen={zen}
        onOpen={vi.fn()}
      />,
    );

  it("shows trailing badges when not in Zen", () => {
    renderBody(false);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("S2")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();
  });

  it("hides trailing badges in Zen, keeping shortId + title + status", () => {
    renderBody(true);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument(); // shortId (leading) stays
    expect(screen.queryByText("S2")).not.toBeInTheDocument();
    expect(screen.queryByText("Frontend")).not.toBeInTheDocument();
  });
});
