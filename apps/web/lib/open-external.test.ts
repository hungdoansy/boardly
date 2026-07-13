// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const { isTauriMock, openUrlMock } = vi.hoisted(() => ({
  isTauriMock: vi.fn(),
  openUrlMock: vi.fn(),
}));
vi.mock("./platform", () => ({ isTauri: isTauriMock }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: openUrlMock }));

import { openExternal } from "./open-external";

afterEach(() => {
  vi.clearAllMocks();
});

describe("openExternal", () => {
  it("opens a new tab on web", async () => {
    isTauriMock.mockReturnValue(false);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openExternal("https://example.com");
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("uses the Tauri opener on desktop", async () => {
    isTauriMock.mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await openExternal("https://example.com");
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores non-http(s) URLs (web and desktop)", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    isTauriMock.mockReturnValue(false);
    await openExternal("javascript:alert(1)");
    await openExternal("slack://channel/123");
    isTauriMock.mockReturnValue(true);
    await openExternal("data:text/html,x");
    expect(open).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("swallows a failing opener call on desktop (never throws)", async () => {
    isTauriMock.mockReturnValue(true);
    openUrlMock.mockRejectedValueOnce(new Error("opener unavailable"));
    await expect(openExternal("https://example.com")).resolves.toBeUndefined();
  });
});
