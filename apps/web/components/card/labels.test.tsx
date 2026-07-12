// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  assignLabel,
  createCard,
  createLabel,
  deleteLabel,
  execute,
  renameLabel,
} from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { getCard, initBoard } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useCardById } from "../../lib/use-board";
import { LabelManager } from "../board/label-manager";
import { CardLabels } from "./labels";

function CardLabelsHarness({ cardId }: { cardId: string }) {
  const card = useCardById(cardId);
  return card ? <CardLabels card={card} /> : null;
}

function seed(withLabel = false): MemoryContext {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "Card" });
  if (withLabel) {
    execute(createLabel, ctx, { id: "l1", name: "Bug", color: "#EB5757" });
    execute(assignLabel, ctx, { cardId: "c1", labelId: "l1" });
  }
  return ctx;
}

const renderCardLabels = (ctx: MemoryContext) =>
  render(
    <BoardlyProvider context={ctx}>
      <CardLabelsHarness cardId="c1" />
    </BoardlyProvider>,
  );

afterEach(() => {
  cleanup();
});

describe("CardLabels", () => {
  it("creates a label and assigns it to the card", () => {
    const ctx = seed();
    renderCardLabels(ctx);
    fireEvent.click(screen.getByRole("button", { name: /add label/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "New label name" }), {
      target: { value: "Bug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create label" }));

    expect(getCard(ctx.getBoardDoc(), "c1")?.labelIds).toHaveLength(1);
  });

  it("unassigns a label from the popover", () => {
    const ctx = seed(true);
    renderCardLabels(ctx);
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /bug/i }));

    expect(getCard(ctx.getBoardDoc(), "c1")?.labelIds).toHaveLength(0);
  });

  it("reflects a label rename on the card chip (propagates by id)", () => {
    const ctx = seed(true);
    renderCardLabels(ctx);
    expect(screen.getByText("Bug")).toBeInTheDocument();

    act(() => {
      execute(renameLabel, ctx, { labelId: "l1", name: "Defect" });
    });

    expect(screen.getByText("Defect")).toBeInTheDocument();
    expect(screen.queryByText("Bug")).not.toBeInTheDocument();
  });

  it("removes the chip when the label is deleted", () => {
    const ctx = seed(true);
    renderCardLabels(ctx);
    expect(screen.getByText("Bug")).toBeInTheDocument();

    act(() => {
      execute(deleteLabel, ctx, { labelId: "l1" });
    });

    expect(screen.queryByText("Bug")).not.toBeInTheDocument();
  });
});

describe("LabelManager", () => {
  it("renames a label inline", () => {
    const ctx = seed(true);
    render(
      <BoardlyProvider context={ctx}>
        <LabelManager />
      </BoardlyProvider>,
    );
    const input = screen.getByRole("textbox", { name: "Rename Bug" });
    fireEvent.change(input, { target: { value: "Defect" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("textbox", { name: "Rename Defect" })).toBeInTheDocument();
  });
});
