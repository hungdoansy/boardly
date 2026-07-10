"use client";

import { authStore, type AuthStore } from "./auth-store";

/** Static-export friendly: the API origin is baked in at build via env. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8787";

/** WebSocket URL of the Yjs sync server (derived from the API origin). */
export const SYNC_WS_URL = `${API_BASE_URL.replace(/^http/, "ws")}/sync`;

export interface ApiResult {
  ok: boolean;
  /** Generic, user-safe message on failure (never reveals which field was wrong). */
  error?: string;
}

type FetchLike = typeof fetch;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  store?: AuthStore;
}

const GENERIC_ERROR = "invalid email or password";
const NETWORK_ERROR = "can't reach the server — please try again";

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? API_BASE_URL).replace(/\/$/, "");
  const doFetch: FetchLike = options.fetch ?? ((...args) => globalThis.fetch(...args));
  const store = options.store ?? authStore;

  const post = (path: string, body?: unknown, token?: string | null): Promise<Response> =>
    doFetch(`${baseUrl}${path}`, {
      method: "POST",
      credentials: "include", // send/receive the httpOnly refresh cookie
      headers: {
        // Only advertise a JSON body when there is one — an empty body with
        // `content-type: application/json` is rejected as 400 by Fastify.
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const client = {
    /** Create an account. Uniform: the server never reveals if the email existed. */
    async signup(email: string, password: string): Promise<ApiResult> {
      let res: Response;
      try {
        res = await post("/auth/signup", { email, password });
      } catch {
        return { ok: false, error: NETWORK_ERROR };
      }
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: res.status === 400 ? "please enter a valid email and password" : GENERIC_ERROR,
      };
    },

    async login(email: string, password: string): Promise<ApiResult> {
      let res: Response;
      try {
        res = await post("/auth/login", { email, password });
      } catch {
        return { ok: false, error: NETWORK_ERROR };
      }
      if (!res.ok) return { ok: false, error: GENERIC_ERROR };
      const data = (await res.json()) as { accessToken?: string };
      if (!data.accessToken) return { ok: false, error: GENERIC_ERROR };
      store.setAccessToken(data.accessToken);
      return { ok: true };
    },

    /** Silent refresh via the httpOnly cookie. Returns whether a token was obtained. */
    async refresh(): Promise<boolean> {
      try {
        const res = await post("/auth/refresh");
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken?: string };
        if (!data.accessToken) return false;
        store.setAccessToken(data.accessToken);
        return true;
      } catch {
        // Network error (e.g. server down) → treat as not authenticated.
        return false;
      }
    },

    /** Re-establish a session on load; resolves the store to authenticated/anonymous. */
    async bootstrap(): Promise<void> {
      const ok = await client.refresh();
      if (!ok) store.setAnonymous();
    },

    async logout(): Promise<void> {
      try {
        await post("/auth/logout");
      } finally {
        store.clear();
      }
    },

    /** Mint a single-use WS ticket for a sync document (auto-refreshes on 401). */
    async getSyncTicket(documentName: string): Promise<string> {
      const res = await client.authFetch("/sync/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentName }),
      });
      if (!res.ok) throw new Error(`sync ticket request failed (${res.status})`);
      const data = (await res.json()) as { ticket?: string };
      if (!data.ticket) throw new Error("sync ticket missing");
      return data.ticket;
    },

    /**
     * Authenticated fetch: attaches the Bearer token and, on a 401, refreshes
     * exactly once and retries. If the refresh (or the retry) still fails, the
     * session is cleared.
     */
    async authFetch(path: string, init: RequestInit = {}): Promise<Response> {
      const call = (token: string | null): Promise<Response> =>
        doFetch(`${baseUrl}${path}`, {
          ...init,
          credentials: "include",
          headers: {
            ...init.headers,
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        });

      let res = await call(store.getAccessToken());
      if (res.status !== 401) return res;

      const refreshed = await client.refresh();
      if (!refreshed) {
        store.clear();
        return res;
      }
      res = await call(store.getAccessToken());
      if (res.status === 401) store.clear();
      return res;
    },
  };

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** App-wide singleton wired to the session store. */
export const apiClient: ApiClient = createApiClient();
