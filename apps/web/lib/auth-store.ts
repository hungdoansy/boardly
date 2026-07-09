"use client";

import { useSyncExternalStore } from "react";

/**
 * In-memory session store. The access token lives ONLY in memory (never
 * localStorage) so XSS can't exfiltrate it; the refresh token is an httpOnly
 * cookie the JS never sees. On reload the token is gone and is re-obtained by a
 * silent `/refresh` (see api-client `bootstrap`).
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthSession {
  status: AuthStatus;
  accessToken: string | null;
  userId: string | null;
}

const INITIAL: AuthSession = { status: "loading", accessToken: null, userId: null };

/** Decode a JWT's `sub` without verifying (the server verifies; the client only reads). */
export function decodeJwtSub(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function createAuthStore(initial: AuthSession = INITIAL) {
  let state: AuthSession = initial;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const l of listeners) l();
  };
  const set = (next: AuthSession): void => {
    state = next;
    emit();
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): AuthSession {
      return state;
    },
    getAccessToken(): string | null {
      return state.accessToken;
    },
    /** Record a signed-in session from a fresh access token. */
    setAccessToken(accessToken: string): void {
      set({ status: "authenticated", accessToken, userId: decodeJwtSub(accessToken) });
    },
    /** Mark the session resolved-anonymous (no valid refresh cookie). */
    setAnonymous(): void {
      set({ status: "anonymous", accessToken: null, userId: null });
    },
    clear(): void {
      set({ status: "anonymous", accessToken: null, userId: null });
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;

/** The app-wide singleton session store. */
export const authStore: AuthStore = createAuthStore();

/** Subscribe a component to the session. */
export function useAuthSession(store: AuthStore = authStore): AuthSession {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => INITIAL);
}
