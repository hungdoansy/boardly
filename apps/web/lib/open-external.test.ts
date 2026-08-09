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
    // `noopener` makes `window.open` return null even on success, so the web path
    // must report success regardless of what it gets back.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(openExternal("https://example.com")).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("uses the Tauri opener on desktop", async () => {
    isTauriMock.mockReturnValue(true);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await expect(openExternal("https://example.com")).resolves.toBe(true);
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores non-http(s) URLs (web and desktop)", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    isTauriMock.mockReturnValue(false);
    await expect(openExternal("javascript:alert(1)")).resolves.toBe(false);
    await expect(openExternal("slack://channel/123")).resolves.toBe(false);
    isTauriMock.mockReturnValue(true);
    await expect(openExternal("data:text/html,x")).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("reports a failing opener call on desktop without throwing", async () => {
    isTauriMock.mockReturnValue(true);
    // What a missing/too-narrow `opener:allow-open-url` URL scope looks like from
    // JS: the command rejects with the plugin's ForbiddenUrl error.
    openUrlMock.mockRejectedValueOnce(
      new Error("url not allowed on the configured scope: https://example.com"),
    );
    await expect(openExternal("https://example.com")).resolves.toBe(false);
  });
});
