// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, createMemoryContext, execute, setCardStatus } from "@boardly/commands";
import type { Card } from "@boardly/domain";
import { Status } from "@boardly/domain";
import { getCard, initBoard } from "@boardly/sync";
import { Toaster } from "@boardly/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardContextMenu } from "./card-context-menu";

function setup(onOpen = vi.fn(), initialStatus?: Status) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "My card" });
  if (initialStatus) execute(setCardStatus, ctx, { cardId: "c1", status: initialStatus });
  const card = getCard(ctx.getBoardDoc(), "c1") as Card;
  render(
    <BoardlyProvider context={ctx}>
      <CardContextMenu card={card} onOpen={onOpen}>
        <button type="button">card face</button>
      </CardContextMenu>
      <Toaster />
    </BoardlyProvider>,
  );
  return { ctx, onOpen };
}

const openMenu = (): void => {
  fireEvent.contextMenu(screen.getByText("card face"), { clientX: 5, clientY: 5 });
};

afterEach(() => cleanup());

describe("CardContextMenu", () => {
  it("opens on right-click with the expected items", async () => {
    setup();
    openMenu();
    expect(await screen.findByText("Open")).toBeVisible();
    expect(screen.getByText("Mark done")).toBeVisible();
    expect(screen.getByText("Status")).toBeVisible();
    expect(screen.getByText("Priority")).toBeVisible();
    expect(screen.getByText("Project")).toBeVisible();
    expect(screen.getByText("Copy link")).toBeVisible();
    expect(screen.getByText("Archive")).toBeVisible();
    expect(screen.getByText("Delete")).toBeVisible();
  });

  it("gives every menu row a leading icon glyph (uniform shape, no color dots)", async () => {
    setup();
    openMenu();
    const priority = await screen.findByText("Priority");
    const project = screen.getByText("Project");
    // Each submenu trigger now carries a leading canonical glyph (PriorityIcon /
    // Boxes) plus the trailing chevron — two SVGs, where the old dot was a span.
    expect(priority.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    expect(project.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    // No bespoke rounded-full color dots remain in the open menu.
    const menu = priority.closest("[role='menu']");
    expect(menu?.querySelectorAll(".rounded-full").length).toBe(0);
  });

  it("marks a non-done card done via the quick toggle", async () => {
    const { ctx } = setup();
    openMenu();
    fireEvent.click(await screen.findByText("Mark done"));
    expect(getCard(ctx.getBoardDoc(), "c1")?.status).toBe(Status.Done);
  });

  it("shows 'Mark not done' on a done card and returns it to Todo", async () => {
    const { ctx } = setup(vi.fn(), Status.Done);
    openMenu();
    expect(screen.queryByText("Mark done")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("Mark not done"));
    expect(getCard(ctx.getBoardDoc(), "c1")?.status).toBe(Status.Todo);
  });

  it("fires onOpen from the Open item", async () => {
    const { onOpen } = setup();
    openMenu();
    fireEvent.click(await screen.findByText("Open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("archives the card", async () => {
    const { ctx } = setup();
    openMenu();
    fireEvent.click(await screen.findByText("Archive"));
    expect(getCard(ctx.getBoardDoc(), "c1")?.archived).toBe(true);
  });

  it("deletes the card after confirming", async () => {
    const { ctx } = setup();
    openMenu();
    fireEvent.click(await screen.findByText("Delete"));
    // Confirmation dialog, not an immediate delete.
    expect(getCard(ctx.getBoardDoc(), "c1")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "Delete card" }));
    await waitFor(() => expect(getCard(ctx.getBoardDoc(), "c1")).toBeFalsy());
  });

  it("copies the card link and toasts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    setup();
    openMenu();
    fireEvent.click(await screen.findByText("Copy link"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toContain("#");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
});
