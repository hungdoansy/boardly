import { describe, expect, it } from "vitest";

import { DEFAULT_ZOOM, ZOOM_MAX, ZOOM_MIN, ZOOM_STEPS, clampZoom, zoomIn, zoomOut } from "./zoom";

describe("zoom constants", () => {
  it("has 1 as the default and a member of the step ladder", () => {
    expect(DEFAULT_ZOOM).toBe(1);
    expect(ZOOM_STEPS).toContain(1);
  });

  it("step ladder is ascending and spans exactly [MIN, MAX]", () => {
    expect(ZOOM_STEPS[0]).toBe(ZOOM_MIN);
    expect(ZOOM_STEPS[ZOOM_STEPS.length - 1]).toBe(ZOOM_MAX);
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      expect(ZOOM_STEPS[i]!).toBeGreaterThan(ZOOM_STEPS[i - 1]!);
    }
  });
});

describe("clampZoom", () => {
  it("passes through in-range values", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.25)).toBe(1.25);
  });

  it("clamps out-of-range values to the bounds", () => {
    expect(clampZoom(5)).toBe(ZOOM_MAX);
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampZoom(NaN)).toBe(DEFAULT_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ZOOM);
  });
});

describe("zoomIn", () => {
  it("moves to the next step up", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomIn(0.9)).toBe(1);
  });

  it("saturates at ZOOM_MAX", () => {
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomIn(10)).toBe(ZOOM_MAX);
  });

  it("snaps a between-steps value up to the next neighbor", () => {
    // 0.95 sits between 0.9 and 1 → next up is 1.
    expect(zoomIn(0.95)).toBe(1);
  });
});

describe("zoomOut", () => {
  it("moves to the next step down", () => {
    expect(zoomOut(1)).toBe(0.9);
    expect(zoomOut(1.1)).toBe(1);
  });

  it("saturates at ZOOM_MIN", () => {
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomOut(0.01)).toBe(ZOOM_MIN);
  });

  it("snaps a between-steps value down to the previous neighbor", () => {
    // 0.95 sits between 0.9 and 1 → previous down is 0.9.
    expect(zoomOut(0.95)).toBe(0.9);
  });
});
