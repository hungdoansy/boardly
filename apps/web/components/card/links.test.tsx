// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addLink, createCard, execute } from "@boardly/commands";
import { createMemoryContext, type MemoryContext } from "@boardly/commands";
import { getCard, initBoard } from "@boardly/sync";
import { Toaster } from "@boardly/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { useCardById } from "../../lib/use-board";
import { CardLinks } from "./links";

function Harness({ cardId }: { cardId: string }) {
  const card = useCardById(cardId);
  return card ? <CardLinks card={card} /> : null;
}

function setup(seed?: (ctx: MemoryContext) => void) {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  execute(createCard, ctx, { id: "c1", title: "Card" });
  seed?.(ctx);
  render(
    <BoardlyProvider context={ctx}>
      <Harness cardId="c1" />
    </BoardlyProvider>,
  );
  return ctx;
}

const field = () => screen.getByRole("textbox", { name: "New link URL" });
const links = (ctx: MemoryContext) => getCard(ctx.getBoardDoc(), "c1")?.links ?? [];

afterEach(() => {
  cleanup();
});

describe("CardLinks", () => {
  it("adds a link and renders a provider chip", () => {
    const ctx = setup();
    fireEvent.change(field(), { target: { value: "https://github.com/o/r/pull/7" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(screen.getByText("o/r#7")).toBeInTheDocument();
    expect(links(ctx)[0]?.provider).toBe("github");
  });

  it("de-duplicates by normalized URL", () => {
    const ctx = setup();
    fireEvent.change(field(), { target: { value: "https://linear.app/a/issue/ABC-1/x" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.change(field(), { target: { value: "https://linear.app/a/issue/ABC-1/x/" } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(links(ctx)).toHaveLength(1);
  });

  it("shows the unfurled title when present", () => {
    setup((ctx) => {
      execute(addLink, ctx, {
        cardId: "c1",
        id: "l1",
        url: "https://example.com/x",
        title: "Example Page",
      });
    });
    expect(screen.getByText("Example Page")).toBeInTheDocument();
  });

  it("renders a link as an external anchor to its URL (opens natively on web)", () => {
    setup((c) => {
      execute(addLink, c, { cardId: "c1", id: "l1", url: "https://example.com/x", title: "Ex" });
    });
    const anchor = screen.getByRole("link", { name: /Ex/ });
    expect(anchor).toHaveAttribute("href", "https://example.com/x");
    expect(anchor).toHaveAttribute("target", "_blank");
  });

  it("ignores a non-http(s) url (XSS guard)", () => {
    const ctx = setup();
    fireEvent.change(field(), { target: { value: "javascript:alert(1)" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(links(ctx)).toHaveLength(0);
  });

  it("stores a pasted `claude --resume` command as a Claude session chip", () => {
    const id = "3d90b1bc-ada0-44c3-9ced-1be176c97044";
    const ctx = setup();
    fireEvent.change(field(), { target: { value: `claude --resume ${id}` } });
    fireEvent.keyDown(field(), { key: "Enter" });

    expect(links(ctx)[0]?.provider).toBe("claude-code");
    expect(links(ctx)[0]?.url).toBe(`claude-code://resume/${id}`);
    // Rendered as a copy button (no page to open), not an external anchor.
    expect(screen.getByRole("button", { name: /Copy resume command/i })).toBeInTheDocument();
    expect(screen.getByText("Claude session 3d90b1bc")).toBeInTheDocument();
  });

  it("copies the resume command and toasts when the chip is clicked", async () => {
    const id = "3d90b1bc-ada0-44c3-9ced-1be176c97044";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
    execute(createCard, ctx, { id: "c1", title: "Card" });
    execute(addLink, ctx, { cardId: "c1", id: "l1", url: `claude-code://resume/${id}` });
    render(
      <BoardlyProvider context={ctx}>
        <Harness cardId="c1" />
        <Toaster />
      </BoardlyProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Copy resume command/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`claude --resume ${id}`));
    expect(await screen.findByText("Resume command copied")).toBeInTheDocument();
  });

  it("removes a link", () => {
    const ctx = setup((c) => {
      execute(addLink, c, { cardId: "c1", id: "l1", url: "https://example.com/x" });
    });
    fireEvent.click(screen.getByRole("button", { name: /remove link/i }));
    expect(links(ctx)).toHaveLength(0);
  });

  it("reorders links with the move controls", () => {
    const ctx = setup((c) => {
      for (const [id, title] of [
        ["l1", "Alpha"],
        ["l2", "Beta"],
        ["l3", "Gamma"],
      ]) {
        execute(addLink, c, {
          cardId: "c1",
          id,
          url: `https://example.com/${id}`,
          title,
        });
      }
    });
    const titleOrder = () => links(ctx).map((l) => l.title);
    expect(titleOrder()).toEqual(["Alpha", "Beta", "Gamma"]);

    // The first link cannot move up.
    expect(screen.getByRole("button", { name: "Move Alpha up" })).toBeDisabled();

    // Move Alpha down → [Beta, Alpha, Gamma].
    fireEvent.click(screen.getByRole("button", { name: "Move Alpha down" }));
    expect(titleOrder()).toEqual(["Beta", "Alpha", "Gamma"]);
  });
});
