// @vitest-environment jsdom
import { DEFAULT_ZOOM } from "@boardly/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Tauri webview module that `applyZoom` dynamically imports on desktop.
// `vi.hoisted` so the mock fn exists before the hoisted `vi.mock` factory runs.
const { nativeSetZoom } = vi.hoisted(() => ({
  nativeSetZoom: vi.fn<(z: number) => Promise<void>>(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: nativeSetZoom }),
}));

import { applyZoom, cacheZoom, parseZoom, readCachedZoom, ZOOM_STORAGE_KEY } from "./zoom";

/** Flush the dynamic import + its chained .then/.catch microtasks. */
const flush = async () => {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty("--app-zoom");
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  nativeSetZoom.mockReset();
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

  it("does not touch the native webview on the web branch", async () => {
    applyZoom(1.25);
    await flush();
    expect(nativeSetZoom).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1.25");
  });
});

describe("applyZoom (desktop / Tauri branch)", () => {
  beforeEach(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    nativeSetZoom.mockResolvedValue(undefined);
  });

  it("pins --app-zoom to 1 and drives the native webview zoom (clamped)", async () => {
    applyZoom(1.5);
    // CSS lever is pinned synchronously; native zoom does the scaling.
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1");
    await flush();
    expect(nativeSetZoom).toHaveBeenCalledWith(1.5);

    applyZoom(99);
    await flush();
    expect(nativeSetZoom).toHaveBeenLastCalledWith(2);
  });

  it("falls back to the CSS lever when the native call rejects", async () => {
    nativeSetZoom.mockRejectedValueOnce(new Error("no capability"));
    applyZoom(1.25);
    await flush();
    expect(document.documentElement.style.getPropertyValue("--app-zoom")).toBe("1.25");
  });

  it("drops a superseded call so the last-requested factor wins", async () => {
    // Warm the dynamic import first so the mocked module is cached; two
    // *concurrent* first-time dynamic imports can race vitest's mock resolution.
    applyZoom(1);
    await flush();
    nativeSetZoom.mockClear();

    applyZoom(1.5);
    applyZoom(0.75); // supersedes the in-flight 1.5 before its promise settles
    await flush();
    expect(nativeSetZoom).toHaveBeenCalledTimes(1);
    expect(nativeSetZoom).toHaveBeenCalledWith(0.75);
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
