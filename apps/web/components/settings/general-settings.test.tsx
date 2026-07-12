// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext } from "@boardly/commands";
import { getBoard, initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { GeneralSettings } from "./general-settings";

function setup() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
  render(
    <BoardlyProvider context={ctx}>
      <GeneralSettings />
    </BoardlyProvider>,
  );
  return ctx;
}

afterEach(() => cleanup());

const prefixOf = (ctx: ReturnType<typeof createMemoryContext>) =>
  getBoard(ctx.getBoardDoc(), "").shortIdPrefix;

describe("GeneralSettings — ticket prefix", () => {
  it("starts empty (ids shown as #123)", () => {
    setup();
    const input = screen.getByRole("textbox", { name: "Ticket prefix" });
    expect(input).toHaveValue("");
    expect(screen.getByText("#42")).toBeInTheDocument(); // preview
  });

  it("normalizes to uppercase/≤5 and persists on blur", () => {
    const ctx = setup();
    const input = screen.getByRole("textbox", { name: "Ticket prefix" });
    fireEvent.change(input, { target: { value: "tec" } });
    fireEvent.blur(input, { target: { value: "tec" } });
    expect(prefixOf(ctx)).toBe("TEC");
    expect(screen.getByText("TEC-42")).toBeInTheDocument();
  });

  it("caps at 5 characters and strips symbols", () => {
    const ctx = setup();
    const input = screen.getByRole("textbox", { name: "Ticket prefix" });
    fireEvent.change(input, { target: { value: "a-b!cdef" } });
    fireEvent.blur(input, { target: { value: "a-b!cdef" } });
    expect(prefixOf(ctx)).toBe("ABCDE");
  });

  it("allows clearing back to empty", () => {
    const ctx = setup();
    const input = screen.getByRole("textbox", { name: "Ticket prefix" });
    fireEvent.blur(input, { target: { value: "TEC" } });
    expect(prefixOf(ctx)).toBe("TEC");
    fireEvent.blur(input, { target: { value: "" } });
    expect(prefixOf(ctx)).toBe("");
  });
});
