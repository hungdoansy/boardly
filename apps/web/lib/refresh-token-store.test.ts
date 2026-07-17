// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import { createRefreshTokenStore, TOKEN_ACCOUNT } from "./refresh-token-store";

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  invoke.mockReset();
});

describe("refresh token store (platform switch)", () => {
  it("web: everything is a no-op and load() returns null (cookie is server-managed)", async () => {
    const store = createRefreshTokenStore();
    await store.save("tok");
    expect(await store.load()).toBeNull();
    await store.clear();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("desktop: save/load/clear go through the token file via invoke", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const store = createRefreshTokenStore();

    invoke.mockResolvedValueOnce(undefined);
    await store.save("tok");
    expect(invoke).toHaveBeenCalledWith("token_set", {
      account: TOKEN_ACCOUNT,
      secret: "tok",
    });

    invoke.mockResolvedValueOnce("stored-tok");
    expect(await store.load()).toBe("stored-tok");
    expect(invoke).toHaveBeenLastCalledWith("token_get", { account: TOKEN_ACCOUNT });

    invoke.mockResolvedValueOnce(undefined);
    await store.clear();
    expect(invoke).toHaveBeenLastCalledWith("token_delete", { account: TOKEN_ACCOUNT });
  });

  it("desktop: load() returns null (not throws) when the token store has no entry", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const store = createRefreshTokenStore();
    invoke.mockRejectedValueOnce(new Error("no entry"));
    expect(await store.load()).toBeNull();
  });
});
