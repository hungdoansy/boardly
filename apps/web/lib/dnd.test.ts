import { describe, expect, it } from "vitest";

import { neighborsInList, planMove, reorder, sameNeighbors } from "./dnd";

describe("neighborsInList", () => {
  it("returns the surrounding ids", () => {
    expect(neighborsInList(["a", "c", "b"], "c")).toEqual({ afterId: "a", beforeId: "b" });
  });
  it("null at the start boundary", () => {
    expect(neighborsInList(["c", "a", "b"], "c")).toEqual({ afterId: null, beforeId: "a" });
  });
  it("null at the end boundary", () => {
    expect(neighborsInList(["a", "b", "c"], "c")).toEqual({ afterId: "b", beforeId: null });
  });
  it("single item has no neighbors", () => {
    expect(neighborsInList(["a"], "a")).toEqual({ afterId: null, beforeId: null });
  });
});

describe("reorder", () => {
  it("moves within a container to the over position", () => {
    expect(reorder(["a", "b", "c"], "c", "a", { sameContainer: true })).toEqual(["c", "a", "b"]);
  });
  it("inserts before the over item across containers", () => {
    expect(reorder(["x", "y"], "c", "y", { sameContainer: false })).toEqual(["x", "c", "y"]);
  });
  it("appends across containers when dropped on an empty column (overId null)", () => {
    expect(reorder([], "c", null, { sameContainer: false })).toEqual(["c"]);
  });
});

describe("planMove", () => {
  it("computes cross-column neighbors", () => {
    // move `c` into [x, y] before y  → [x, c, y]
    expect(
      planMove({
        currentOrder: ["c", "d"],
        destOrder: ["x", "y"],
        activeId: "c",
        overId: "y",
        sameContainer: false,
      }),
    ).toEqual({ afterId: "x", beforeId: "y" });
  });

  it("computes within-column reorder neighbors", () => {
    // [a, b, c] move c over a → [c, a, b], c's neighbors: after null, before a
    expect(
      planMove({
        currentOrder: ["a", "b", "c"],
        destOrder: ["a", "b", "c"],
        activeId: "c",
        overId: "a",
        sameContainer: true,
      }),
    ).toEqual({ afterId: null, beforeId: "a" });
  });

  it("is a no-op when the item lands on its current position", () => {
    expect(
      planMove({
        currentOrder: ["a", "b", "c"],
        destOrder: ["a", "b", "c"],
        activeId: "b",
        overId: "b",
        sameContainer: true,
      }),
    ).toBeNull();
  });

  it("appends to an empty destination column", () => {
    expect(
      planMove({
        currentOrder: ["c"],
        destOrder: [],
        activeId: "c",
        overId: null,
        sameContainer: false,
      }),
    ).toEqual({ afterId: null, beforeId: null });
  });
});

describe("sameNeighbors", () => {
  it("compares both sides", () => {
    expect(sameNeighbors({ afterId: "a", beforeId: "b" }, { afterId: "a", beforeId: "b" })).toBe(
      true,
    );
    expect(sameNeighbors({ afterId: "a", beforeId: "b" }, { afterId: "a", beforeId: "c" })).toBe(
      false,
    );
  });
});
