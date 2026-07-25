import { getBoard, initBoard } from "@boardly/sync";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { execute } from "../command";
import { createMemoryContext } from "../context";
import { setShowEmptyColumns, setZoom } from "./board";

function seed() {
  const ctx = createMemoryContext({ userId: "me", clientId: "c1", now: () => 100 });
  initBoard(ctx.getBoardDoc(), { title: "Board", now: 100 });
  return ctx;
}

describe("setShowEmptyColumns", () => {
  it("flips the board-meta flag (defaults to true, then off/on)", () => {
    const ctx = seed();
    // Defaults to true when never set.
    expect(getBoard(ctx.getBoardDoc(), "me").showEmptyColumns).toBe(true);

    const off = execute(setShowEmptyColumns, ctx, { show: false });
    expect(off.showEmptyColumns).toBe(false);
    expect(getBoard(ctx.getBoardDoc(), "me").showEmptyColumns).toBe(false);

    const on = execute(setShowEmptyColumns, ctx, { show: true });
    expect(on.showEmptyColumns).toBe(true);
  });

  it("rejects a non-boolean via zod", () => {
    const ctx = seed();
    expect(() => execute(setShowEmptyColumns, ctx, { show: "yes" as never })).toThrow(ZodError);
  });
});

describe("setZoom", () => {
  it("sets the zoom factor (defaults to 1)", () => {
    const ctx = seed();
    expect(getBoard(ctx.getBoardDoc(), "me").zoom).toBe(1);

    const zoomed = execute(setZoom, ctx, { factor: 1.5 });
    expect(zoomed.zoom).toBe(1.5);
    expect(getBoard(ctx.getBoardDoc(), "me").zoom).toBe(1.5);
  });

  it("clamps an out-of-range factor instead of rejecting it", () => {
    const ctx = seed();
    expect(execute(setZoom, ctx, { factor: 99 }).zoom).toBe(2);
    expect(execute(setZoom, ctx, { factor: 0 }).zoom).toBe(0.5);
  });

  it("rejects a non-number via zod", () => {
    const ctx = seed();
    expect(() => execute(setZoom, ctx, { factor: "big" as never })).toThrow(ZodError);
  });
});
