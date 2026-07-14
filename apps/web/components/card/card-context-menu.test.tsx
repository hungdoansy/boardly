// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createCard, createMemoryContext, execute } from "@boardly/commands";
import type { Card } from "@boardly/domain";
import { getCard, initBoard } from "@boardly/sync";
import { Toaster } from "@boardly/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { CardContextMenu } from "./card-context-menu";

function setup(onOpen = vi.fn()) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "My card" });
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
    expect(screen.getByText("Status")).toBeVisible();
    expect(screen.getByText("Priority")).toBeVisible();
    expect(screen.getByText("Project")).toBeVisible();
    expect(screen.getByText("Copy link")).toBeVisible();
    expect(screen.getByText("Archive")).toBeVisible();
    expect(screen.getByText("Delete")).toBeVisible();
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
