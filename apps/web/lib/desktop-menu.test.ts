// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./platform", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";

import { setupDesktopMenu } from "./desktop-menu";
import { isTauri } from "./platform";

afterEach(() => {
  vi.clearAllMocks();
});

describe("setupDesktopMenu", () => {
  it("is a no-op on web (not Tauri) and never subscribes", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    const cleanup = await setupDesktopMenu();
    expect(listen).not.toHaveBeenCalled();
    expect(() => cleanup()).not.toThrow();
  });

  it("dispatches a synthetic Escape when the close-view menu event fires", async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    const unlisten = vi.fn();
    let fire: (() => void) | undefined;
    vi.mocked(listen).mockImplementation((_name, cb) => {
      fire = () => (cb as (e: unknown) => void)({});
      return Promise.resolve(unlisten);
    });

    const keys: string[] = [];
    const onKey = (e: KeyboardEvent): void => {
      keys.push(e.key);
    };
    document.addEventListener("keydown", onKey);

    const cleanup = await setupDesktopMenu();
    expect(listen).toHaveBeenCalledWith("menu-close-view", expect.any(Function));

    fire?.();
    expect(keys).toContain("Escape");

    cleanup();
    expect(unlisten).toHaveBeenCalled();
    document.removeEventListener("keydown", onKey);
  });
});
