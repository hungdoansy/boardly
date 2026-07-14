// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "./clipboard";

const original = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: original, configurable: true });
  vi.restoreAllMocks();
});

function stubClipboard(writeText: (t: string) => Promise<void>): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("copyText", () => {
  it("writes to the clipboard and resolves true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("resolves false when writeText rejects (never throws)", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    await expect(copyText("x")).resolves.toBe(false);
  });

  it("resolves false when the Clipboard API is absent", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await expect(copyText("x")).resolves.toBe(false);
  });
});
