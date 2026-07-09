import { describe, expect, it } from "vitest";

import { byOrd, compareOrd, fracOf, keyBetween } from "./ordering";

const between = (a: string, k: string, b: string): boolean =>
  compareOrd(a, k) < 0 && compareOrd(k, b) < 0;

describe("keyBetween", () => {
  it("yields a valid first key from (null, null)", () => {
    const k = keyBetween(null, null, "c1");
    expect(k.endsWith("-c1")).toBe(true);
    expect(fracOf(k).length).toBeGreaterThan(0);
  });

  it("produces a key strictly between two neighbors", () => {
    const a = keyBetween(null, null, "c1");
    const b = keyBetween(a, null, "c1");
    expect(compareOrd(a, b)).toBeLessThan(0);
    const mid = keyBetween(a, b, "c1");
    expect(between(a, mid, b)).toBe(true);
  });

  it("gives two clients different keys that BOTH sort between the same neighbors", () => {
    const a = keyBetween(null, null, "c1");
    const b = keyBetween(a, null, "c1");
    const k1 = keyBetween(a, b, "c1");
    const k2 = keyBetween(a, b, "c2");
    expect(k1).not.toBe(k2);
    expect(between(a, k1, b)).toBe(true);
    expect(between(a, k2, b)).toBe(true);
  });

  it("keeps repeated inserts into the same gap ordered", () => {
    const lo = keyBetween(null, null, "c1");
    let hi = keyBetween(lo, null, "c1");
    for (let i = 0; i < 6; i++) {
      const mid = keyBetween(lo, hi, "c1");
      expect(between(lo, mid, hi)).toBe(true);
      hi = mid;
    }
  });
});

describe("byOrd", () => {
  it("sorts objects by their ord", () => {
    const a = keyBetween(null, null, "c1");
    const b = keyBetween(a, null, "c1");
    const items = [{ ord: b }, { ord: a }];
    expect([...items].sort(byOrd).map((x) => x.ord)).toEqual([a, b]);
  });
});
