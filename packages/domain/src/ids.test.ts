import { describe, expect, it } from "vitest";

import { formatShortId, newId, parseShortId } from "./ids";

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

describe("newId", () => {
  it("produces unique, uuid-shaped ids", () => {
    const a = newId();
    const b = newId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
