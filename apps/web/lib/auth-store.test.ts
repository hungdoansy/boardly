import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createAuthStore, decodeJwtSub } from "./auth-store";

// A minimal unsigned JWT with the given `sub` (the client only reads the claim;
// the server verifies the signature).
function fakeJwt(sub: string): string {
  const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "EdDSA" })}.${b64({ sub })}.sig`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth store", () => {
  it("starts in the loading state", () => {
    expect(createAuthStore().getSnapshot().status).toBe("loading");
  });

  it("derives the user id from the access token's sub", () => {
    const store = createAuthStore();
    store.setAccessToken(fakeJwt("user-123"));
    const snap = store.getSnapshot();
    expect(snap.status).toBe("authenticated");
    expect(snap.userId).toBe("user-123");
    expect(snap.accessToken).toContain(".");
  });

  it("clear() drops the token and marks anonymous; notifies subscribers", () => {
    const store = createAuthStore();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().status));
    store.setAccessToken(fakeJwt("u1"));
    store.clear();
    expect(store.getSnapshot().accessToken).toBeNull();
    expect(store.getSnapshot().status).toBe("anonymous");
    expect(seen).toEqual(["authenticated", "anonymous"]);
  });

  it("decodeJwtSub returns null for garbage", () => {
    expect(decodeJwtSub("not-a-jwt")).toBeNull();
  });
});

describe("api client session logic", () => {
  const opts = (fetchImpl: typeof fetch) => {
    const store = createAuthStore();
    return {
      store,
      client: createApiClient({ baseUrl: "http://api.test", fetch: fetchImpl, store }),
    };
  };

  it("login stores the access token on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: fakeJwt("u1") }));
    const { store, client } = opts(fetchMock);
    const res = await client.login("a@b.com", "password1");
    expect(res.ok).toBe(true);
    expect(store.getSnapshot().userId).toBe("u1");
  });

  it("login returns a generic error and stores nothing on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: "invalid email or password" }));
    const { store, client } = opts(fetchMock);
    const res = await client.login("a@b.com", "wrong-password");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid email or password");
    expect(store.getSnapshot().accessToken).toBeNull();
  });

  it("bootstrap resolves to anonymous when refresh fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, {}));
    const { store, client } = opts(fetchMock);
    await client.bootstrap();
    expect(store.getSnapshot().status).toBe("anonymous");
  });

  it("bootstrap authenticates from the refresh cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { accessToken: fakeJwt("u9") }));
    const { store, client } = opts(fetchMock);
    await client.bootstrap();
    expect(store.getSnapshot().status).toBe("authenticated");
    expect(store.getSnapshot().userId).toBe("u9");
  });

  it("authFetch refreshes once on 401, then retries with the new token", async () => {
    const calls: { path: string; auth: string | null }[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      const auth = ((init?.headers ?? {}) as Record<string, string>).authorization ?? null;
      if (path.endsWith("/auth/refresh")) return jsonResponse(200, { accessToken: fakeJwt("u1") });
      calls.push({ path, auth });
      // First protected call (no token) → 401; retry (with token) → 200.
      return calls.length === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: true });
    });
    const { store, client } = opts(fetchMock as unknown as typeof fetch);
    const res = await client.authFetch("/boards");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2); // original + one retry
    expect(calls[1]?.auth).toBe(`Bearer ${store.getAccessToken()}`);
  });

  it("authFetch clears the session when the refresh also fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/auth/refresh")) return jsonResponse(401, {});
      return jsonResponse(401, {});
    });
    const { store, client } = opts(fetchMock as unknown as typeof fetch);
    store.setAccessToken(fakeJwt("u1"));
    const res = await client.authFetch("/boards");
    expect(res.status).toBe(401);
    expect(store.getSnapshot().status).toBe("anonymous");
  });
});

describe("desktop refresh-token wiring (injected keychain store)", () => {
  const memStore = () => {
    let v: string | null = null;
    return {
      save: vi.fn(async (t: string) => {
        v = t;
      }),
      load: vi.fn(async () => v),
      clear: vi.fn(async () => {
        v = null;
      }),
    };
  };

  it("login stashes a body refresh token; refresh loads + sends it and rotates", async () => {
    const refreshStore = memStore();
    const seen: Array<{ path: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      seen.push({ path, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (path.endsWith("/auth/login"))
        return jsonResponse(200, { accessToken: fakeJwt("u1"), refreshToken: "R1" });
      if (path.endsWith("/auth/refresh"))
        return jsonResponse(200, { accessToken: fakeJwt("u1"), refreshToken: "R2" });
      return jsonResponse(200, {});
    });
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: fetchMock as unknown as typeof fetch,
      store: createAuthStore(),
      refreshStore,
    });

    await client.login("a@b.com", "password1");
    expect(refreshStore.save).toHaveBeenCalledWith("R1");

    await client.refresh();
    const refreshCall = seen.find((s) => s.path.endsWith("/auth/refresh"));
    expect(refreshCall?.body).toEqual({ refreshToken: "R1" }); // loaded from the store
    expect(refreshStore.save).toHaveBeenLastCalledWith("R2"); // rotation persisted
  });

  it("logout clears the keychain entry", async () => {
    const refreshStore = memStore();
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: vi.fn().mockResolvedValue(jsonResponse(200, {})) as unknown as typeof fetch,
      store: createAuthStore(),
      refreshStore,
    });
    await client.logout();
    expect(refreshStore.clear).toHaveBeenCalled();
  });
});
