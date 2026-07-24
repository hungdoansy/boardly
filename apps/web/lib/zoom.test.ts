// @vitest-environment jsdom
import { DEFAULT_ZOOM } from "@boardly/domain";
import { afterEach, describe, expect, it } from "vitest";

import { applyZoom, cacheZoom, parseZoom, readCachedZoom, ZOOM_STORAGE_KEY } from "./zoom";

afterEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty("--app-zoom");
});

describe("applyZoom", () => {
  it("stamps the factor onto <html> as --app-zoom", () => {
    applyZoom(1.25);
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1.25");
  });

  it("clamps an out-of-range factor before stamping", () => {
    applyZoom(99);
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("2");
  });
});

describe("parseZoom", () => {
  it("parses a valid stored string", () => {
    expect(parseZoom("1.5")).toBe(1.5);
  });

  it("falls back to the default for null or garbage", () => {
    expect(parseZoom(null)).toBe(DEFAULT_ZOOM);
    expect(parseZoom("not-a-number")).toBe(DEFAULT_ZOOM);
  });

  it("clamps an out-of-range stored value", () => {
    expect(parseZoom("5")).toBe(2);
    expect(parseZoom("0.1")).toBe(0.5);
  });
});

describe("cacheZoom / readCachedZoom", () => {
  it("round-trips a clamped factor through localStorage", () => {
    cacheZoom(1.75);
    expect(localStorage.getItem(ZOOM_STORAGE_KEY)).toBe("1.75");
    expect(readCachedZoom()).toBe(1.75);
  });

  it("reads the default when nothing is cached", () => {
    expect(readCachedZoom()).toBe(DEFAULT_ZOOM);
  });
});
