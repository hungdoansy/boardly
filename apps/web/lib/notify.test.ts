// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const isPermissionGranted = vi.fn();
const requestPermission = vi.fn();
vi.mock("@tauri-apps/plugin-notification", () => ({
  sendNotification: (...a: unknown[]) => sendNotification(...a),
  isPermissionGranted: () => isPermissionGranted(),
  requestPermission: () => requestPermission(),
}));

import { notify } from "./notify";

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  delete (globalThis as Record<string, unknown>).Notification;
  vi.clearAllMocks();
});

describe("notify (platform switch)", () => {
  it("desktop: sends via the Tauri plugin when already permitted", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    isPermissionGranted.mockResolvedValue(true);
    const ok = await notify("Due today", "Fix login");
    expect(ok).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith({ title: "Due today", body: "Fix login" });
  });

  it("desktop: requests permission first when not yet granted", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    isPermissionGranted.mockResolvedValue(false);
    requestPermission.mockResolvedValue("granted");
    expect(await notify("a", "b")).toBe(true);
    expect(requestPermission).toHaveBeenCalled();
    expect(sendNotification).toHaveBeenCalled();
  });

  it("web: uses the Notifications API when granted", async () => {
    const ctor = vi.fn();
    (globalThis as Record<string, unknown>).Notification = Object.assign(ctor, {
      permission: "granted",
    });
    const ok = await notify("a", "b");
    expect(ok).toBe(true);
    expect(ctor).toHaveBeenCalledWith("a", { body: "b" });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("web: returns false (no throw) when the Notifications API is absent", async () => {
    expect(await notify("a", "b")).toBe(false);
  });
});
