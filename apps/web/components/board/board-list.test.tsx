// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createBoard, createMemoryContext, execute } from "@boardly/commands";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { BoardList } from "./board-list";

function renderList(seedTitle?: string) {
  const ctx = createMemoryContext();
  if (seedTitle) execute(createBoard, ctx, { title: seedTitle });
  render(
    <BoardlyProvider context={ctx}>
      <BoardList />
    </BoardlyProvider>,
  );
  return ctx;
}

beforeEach(() => {
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
});

describe("BoardList (single-board)", () => {
  it("lists the one board", () => {
    renderList("Main board");
    expect(screen.getByText("Main board")).toBeInTheDocument();
  });

  it("exposes no create or archive affordances", () => {
    renderList("Main board");
    expect(screen.queryByRole("button", { name: "New board" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
  });

  it("still renders the Boards navigation landmark (auth waits on it)", () => {
    renderList("Main board");
    expect(screen.getByRole("navigation", { name: "Boards" })).toBeInTheDocument();
  });
});
