import { describe, expect, it } from "vitest";

import {
  formatShortId,
  formatTicketId,
  formatTicketRef,
  newId,
  normalizeTicketPrefix,
  parseShortId,
  parseTicketRef,
  repairTicketNumbers,
  slugify,
} from "./ids";

describe("formatTicketId", () => {
  it("shows #{number} when the prefix is empty", () => {
    expect(formatTicketId("", 7)).toBe("#7");
    expect(formatTicketId("", 142)).toBe("#142");
  });

  it("shows {PREFIX}-{number} when the prefix is set", () => {
    expect(formatTicketId("TEC", 7)).toBe("TEC-7");
    expect(formatTicketId("BRD", 142)).toBe("BRD-142");
  });
});

describe("normalizeTicketPrefix", () => {
  it("uppercases and keeps only alphanumerics", () => {
    expect(normalizeTicketPrefix("tec")).toBe("TEC");
    expect(normalizeTicketPrefix("te-c1!")).toBe("TEC1");
  });

  it("caps at 5 characters", () => {
    expect(normalizeTicketPrefix("toolong")).toBe("TOOLO");
    expect(normalizeTicketPrefix("ABCDEFGH")).toBe("ABCDE");
  });

  it("allows an empty result", () => {
    expect(normalizeTicketPrefix("")).toBe("");
    expect(normalizeTicketPrefix("---")).toBe("");
  });
});

describe("slugify", () => {
  it("kebab-cases a title", () => {
    expect(slugify("Fix the login bug!")).toBe("fix-the-login-bug");
  });

  it("folds diacritics and drops symbols", () => {
    expect(slugify("Café — déjà vu")).toBe("cafe-deja-vu");
  });

  it("returns empty for a title with no alphanumerics", () => {
    expect(slugify("!!! ??? ---")).toBe("");
  });
});

describe("formatTicketRef", () => {
  it("joins the display id and slug", () => {
    expect(formatTicketRef("TEC", 42, "Fix login")).toBe("TEC-42-fix-login");
    expect(formatTicketRef("", 42, "Fix login")).toBe("42-fix-login");
  });

  it("omits the trailing hyphen when the title has no slug", () => {
    expect(formatTicketRef("TEC", 42, "!!!")).toBe("TEC-42");
    expect(formatTicketRef("", 7, "")).toBe("7");
  });
});

describe("parseTicketRef", () => {
  it("extracts the integer, tolerating prefix and slug", () => {
    expect(parseTicketRef("TEC-42-fix-login")).toBe(42);
    expect(parseTicketRef("42-fix-login")).toBe(42);
    expect(parseTicketRef("TEC-42")).toBe(42);
    expect(parseTicketRef("42")).toBe(42);
  });

  it("resolves by number regardless of a stale prefix or slug", () => {
    // Same card (number 42) linked with a different prefix/slug still resolves.
    expect(parseTicketRef("OLD-42-whatever")).toBe(42);
  });

  it("returns null when there is no number", () => {
    expect(parseTicketRef("nope")).toBeNull();
    expect(parseTicketRef("")).toBeNull();
  });
});

describe("legacy short-id helpers", () => {
  it("formats and round-trips through parseShortId", () => {
    expect(formatShortId("BRD", 142)).toBe("BRD-142");
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

describe("repairTicketNumbers", () => {
  it("returns no overrides without duplicates", () => {
    expect(
      repairTicketNumbers([
        { id: "a", number: 1, createdAt: 1 },
        { id: "b", number: 2, createdAt: 2 },
      ]).size,
    ).toBe(0);
  });

  it("keeps the earliest card and reassigns the later one beyond the max number", () => {
    const map = repairTicketNumbers([
      { id: "a", number: 3, createdAt: 10 },
      { id: "b", number: 3, createdAt: 20 },
    ]);
    expect(map.get("a")).toBeUndefined();
    expect(map.get("b")).toBe(4);
  });

  it("breaks ties by id and is order-independent (stable across replicas)", () => {
    const cards = [
      { id: "y", number: 3, createdAt: 10 },
      { id: "x", number: 3, createdAt: 10 },
    ];
    const forward = repairTicketNumbers(cards);
    const reversed = repairTicketNumbers([...cards].reverse());
    expect(forward.get("x")).toBeUndefined(); // "x" < "y" → keeper
    expect(forward.get("y")).toBe(4);
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
