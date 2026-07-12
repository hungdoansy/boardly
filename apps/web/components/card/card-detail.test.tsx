// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, execute } from "@boardly/commands";
import { createMemoryContext } from "@boardly/commands";
import { getCard, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardDetail } from "./card-detail";

function setup() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, {
    id: "c1",
    title: "Detail card",
  });
  render(
    <BoardlyProvider context={ctx}>
      <CardDetail cardId="c1" onClose={() => {}} />
    </BoardlyProvider>,
  );
  return { ctx };
}

const descriptionField = () => screen.getByRole("textbox", { name: "Description" });

afterEach(() => {
  cleanup();
});

describe("CardDetail", () => {
  it("opens with the card's title and short id", () => {
    setup();
    expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Detail card");
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("persists description edits to the doc (Y.Text)", () => {
    const { ctx } = setup();
    fireEvent.change(descriptionField(), { target: { value: "Ship it **soon**" } });
    expect(getCard(ctx.getBoardDoc(), "c1")?.description).toBe("Ship it **soon**");
  });

  it("renders markdown (bold, list, link) in preview", () => {
    setup();
    fireEvent.change(descriptionField(), {
      target: { value: "**bold** [link](https://example.com)\n\n- item" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "preview" }));

    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    const item = screen.getByText("item");
    expect(item.closest("li")).toBeInTheDocument();
  });

  it("renders an empty editor without error", () => {
    setup();
    expect(descriptionField()).toHaveValue("");
    fireEvent.click(screen.getByRole("tab", { name: "preview" }));
    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument();
  });

  it("renames the card via the title field", () => {
    const { ctx } = setup();
    const input = screen.getByRole("textbox", { name: "Card title" });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(getCard(ctx.getBoardDoc(), "c1")?.title).toBe("Renamed");
  });

  it("opens when cardId changes from null (deps invalidation)", () => {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
    execute(createCard, ctx, { id: "c9", title: "Later" });

    const { rerender } = render(
      <BoardlyProvider context={ctx}>
        <CardDetail cardId={null} onClose={() => {}} />
      </BoardlyProvider>,
    );
    expect(screen.queryByRole("textbox", { name: "Card title" })).not.toBeInTheDocument();

    rerender(
      <BoardlyProvider context={ctx}>
        <CardDetail cardId="c9" onClose={() => {}} />
      </BoardlyProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Card title" })).toHaveValue("Later");
  });
});
