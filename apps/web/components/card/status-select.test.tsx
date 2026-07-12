// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { Status } from "@boardly/domain";
import { addColumn, createCard, createMemoryContext, execute } from "@boardly/commands";
import { getCard, initBoard, listActivity } from "@boardly/sync";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useCardActions, useCardById } from "../../lib/use-board";
import { StatusBadge } from "./status-badge";
import { StatusSelect } from "./status-select";

afterEach(() => cleanup());

describe("StatusBadge", () => {
  it("exposes the status name", () => {
    render(<StatusBadge status={Status.InProgress} />);
    expect(screen.getByLabelText("Status: In Progress")).toBeInTheDocument();
  });
});

describe("StatusSelect", () => {
  it("shows the current status and changes it", () => {
    const onChange = vi.fn();
    render(<StatusSelect value={Status.Todo} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Status" })).toHaveTextContent("Todo");

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /in progress/i }));
    expect(onChange).toHaveBeenCalledWith(Status.InProgress);
  });
});

// Integration: select → command layer → status changes, activity appended, and
// the card's column is untouched (status is independent of column).
function Harness({ cardId }: { cardId: string }) {
  const card = useCardById(cardId);
  const actions = useCardActions();
  if (!card) return null;
  return <StatusSelect value={card.status} onChange={(s) => actions.setStatus(card.id, s)} />;
}

describe("StatusSelect ↔ command layer", () => {
  it("sets status via the command, logs activity, and does not move the card", () => {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "B", now: 0 });
    const col = execute(addColumn, ctx, { title: "To Do" });
    const card = execute(createCard, ctx, {
      columnId: col.id,
      title: "Card",
    })!;

    render(
      <BoardlyProvider context={ctx}>
        <Harness cardId={card.id} />
      </BoardlyProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Status" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("menuitemradio", { name: /^In Review/i }));
    });

    const doc = ctx.getBoardDoc();
    const updated = getCard(doc, card.id);
    expect(updated?.status).toBe(Status.InReview);
    expect(updated?.columnId).toBe(col.id); // unchanged
    const log = listActivity(doc);
    expect(log.at(-1)).toMatchObject({ type: "status", cardId: card.id, to: Status.InReview });
  });
});
