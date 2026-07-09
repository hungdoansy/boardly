import { describe, expect, it } from "vitest";

import { formatShortId, newId, parseShortId, repairShortIds } from "./ids";

describe("short ids", () => {
  it("formats prefix + seq", () => {
    expect(formatShortId("BRD", 142)).toBe("BRD-142");
  });

  it("round-trips through parseShortId", () => {
    expect(parseShortId("BRD-142")).toEqual({ prefix: "BRD", seq: 142 });
    expect(parseShortId(formatShortId("ABC", 7))).toEqual({ prefix: "ABC", seq: 7 });
  });

  it("returns null on malformed short ids", () => {
    expect(parseShortId("nope")).toBeNull();
    expect(parseShortId("BRD-")).toBeNull();
    expect(parseShortId("-1")).toBeNull();
    expect(parseShortId("1BRD-2")).toBeNull();
  });
});

describe("repairShortIds", () => {
  it("returns no overrides without duplicates", () => {
    expect(
      repairShortIds([
        { id: "a", shortId: "BRD-1", createdAt: 1 },
        { id: "b", shortId: "BRD-2", createdAt: 2 },
      ]).size,
    ).toBe(0);
  });

  it("keeps the earliest card and reassigns the later one beyond the max seq", () => {
    const map = repairShortIds([
      { id: "a", shortId: "BRD-3", createdAt: 10 },
      { id: "b", shortId: "BRD-3", createdAt: 20 },
    ]);
    expect(map.get("a")).toBeUndefined();
    expect(map.get("b")).toBe("BRD-4");
  });

  it("breaks ties by id and is order-independent (stable across replicas)", () => {
    const cards = [
      { id: "y", shortId: "BRD-3", createdAt: 10 },
      { id: "x", shortId: "BRD-3", createdAt: 10 },
    ];
    const forward = repairShortIds(cards);
    const reversed = repairShortIds([...cards].reverse());
    expect(forward.get("x")).toBeUndefined(); // "x" < "y" → keeper
    expect(forward.get("y")).toBe("BRD-4");
    expect(Object.fromEntries(reversed)).toEqual(Object.fromEntries(forward));
  });
});

describe("newId", () => {
  it("produces unique, uuid-shaped ids", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
