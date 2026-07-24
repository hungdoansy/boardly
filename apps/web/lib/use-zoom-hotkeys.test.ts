// @vitest-environment jsdom
import { DEFAULT_ZOOM } from "@boardly/domain";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useZoomHotkeys } from "./use-zoom-hotkeys";

afterEach(cleanup);

/** Dispatch a keydown on window and report whether default was prevented. */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  const e = new KeyboardEvent("keydown", { key, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

describe("useZoomHotkeys", () => {
  it("⌘= steps zoom in and prevents default (no browser double-zoom)", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1, setZoom));
    const prevented = press("=", { metaKey: true });
    expect(setZoom).toHaveBeenCalledWith(1.1);
    expect(prevented).toBe(true);
  });

  it("⌘- steps zoom out", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1, setZoom));
    expect(press("-", { metaKey: true })).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(0.9);
  });

  it("⌘0 resets to the default", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1.5, setZoom));
    expect(press("0", { metaKey: true })).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(DEFAULT_ZOOM);
  });

  it("Ctrl+ works cross-platform like ⌘+", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1, setZoom));
    expect(press("+", { ctrlKey: true })).toBe(true);
    expect(setZoom).toHaveBeenCalledWith(1.1);
  });

  it("saturates at the max via zoomIn's clamp", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(2, setZoom));
    press("=", { metaKey: true });
    expect(setZoom).toHaveBeenCalledWith(2);
  });

  it("ignores a bare '=' (no modifier) and does not preventDefault", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1, setZoom));
    expect(press("=")).toBe(false);
    expect(setZoom).not.toHaveBeenCalled();
  });

  it("ignores other ⌘ chords (e.g. ⌘K)", () => {
    const setZoom = vi.fn();
    renderHook(() => useZoomHotkeys(1, setZoom));
    expect(press("k", { metaKey: true })).toBe(false);
    expect(setZoom).not.toHaveBeenCalled();
  });

  it("reads the latest zoom without re-binding (rerender updates the ref)", () => {
    const setZoom = vi.fn();
    const { rerender } = renderHook(({ z }) => useZoomHotkeys(z, setZoom), {
      initialProps: { z: 1 },
    });
    rerender({ z: 1.1 });
    press("=", { metaKey: true });
    expect(setZoom).toHaveBeenLastCalledWith(1.25);
  });

  it("removes its listener on unmount", () => {
    const setZoom = vi.fn();
    const { unmount } = renderHook(() => useZoomHotkeys(1, setZoom));
    unmount();
    press("=", { metaKey: true });
    expect(setZoom).not.toHaveBeenCalled();
  });
});
