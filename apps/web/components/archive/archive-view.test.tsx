// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { archiveCard, createCard, createMemoryContext, execute } from "@boardly/commands";
import { getCard, initBoard, listArchivedCards } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { ArchiveView } from "./archive-view";

/** Seed a board and archive the given titles in order (later = newer deletedAt). */
function setup(archivedTitles: string[] = []) {
  let now = 1000;
  const ctx = createMemoryContext({ clientId: "c", now: () => now });
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  const ids: Record<string, string> = {};
  archivedTitles.forEach((title, i) => {
    const id = `c${i}`;
    execute(createCard, ctx, { id, title });
    now += 1000;
    execute(archiveCard, ctx, { cardId: id });
    ids[title] = id;
  });
  const view = render(
    <BoardlyProvider context={ctx}>
      <ArchiveView onClose={() => {}} />
    </BoardlyProvider>,
  );
  return { ctx, ids, ...view };
}

afterEach(() => cleanup());

describe("ArchiveView", () => {
  it("lists archived cards, most-recently-archived first", () => {
    setup(["First archived", "Second archived"]);
    const opens = screen
      .getAllByRole("button", { name: /^Open / })
      .map((b) => b.getAttribute("aria-label"));
    // "Second archived" was archived later, so it sorts first.
    expect(opens).toEqual(["Open Second archived", "Open First archived"]);
  });

  it("shows a calm empty state when nothing is archived", () => {
    setup([]);
    expect(screen.getByText("No archived cards.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open / })).not.toBeInTheDocument();
  });

  it("restores a card (removing it from the archive) via the row Restore action", () => {
    const { ctx, ids } = setup(["Bring me back"]);
    fireEvent.click(screen.getByRole("button", { name: "Restore Bring me back" }));

    expect(getCard(ctx.getBoardDoc(), ids["Bring me back"]!)?.archived).toBe(false);
    expect(listArchivedCards(ctx.getBoardDoc())).toEqual([]);
    expect(screen.queryByRole("button", { name: "Open Bring me back" })).not.toBeInTheDocument();
  });

  it("permanently deletes only after confirming; cancel keeps the card archived", () => {
    const { ctx, ids } = setup(["Doomed"]);

    // Cancel path.
    fireEvent.click(screen.getByRole("button", { name: "Delete Doomed" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(getCard(ctx.getBoardDoc(), ids["Doomed"]!)?.archived).toBe(true);

    // Confirm path.
    fireEvent.click(screen.getByRole("button", { name: "Delete Doomed" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete card" }));
    expect(getCard(ctx.getBoardDoc(), ids["Doomed"]!)).toBeNull();
  });

  it("opens the card detail drawer (with a Restore footer) when a row is opened", () => {
    setup(["Peek inside"]);
    expect(screen.queryByRole("textbox", { name: "Card title" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Peek inside" }));

    expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Peek inside");
    // Archived card → the drawer footer offers Restore, not Archive.
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("clicking the inline Restore does not also open the detail drawer", () => {
    setup(["Quick restore"]);
    fireEvent.click(screen.getByRole("button", { name: "Restore Quick restore" }));
    // No drawer opened by the inline action.
    expect(screen.queryByRole("textbox", { name: "Card title" })).not.toBeInTheDocument();
  });
});
