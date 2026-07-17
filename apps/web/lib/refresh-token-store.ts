// Where the refresh token lives, per platform (Unit 5.2).
//
// - Web: the refresh token is an httpOnly, SameSite cookie the JS never sees;
//   there is nothing to store client-side, and `/auth/refresh` relies on the
//   cookie (credentials: "include"). All ops are no-ops; `load` returns null.
// - Desktop (Tauri): cookies don't span the native origin ↔ API, so the token
//   is kept in a 0600 file under the app data dir via the app's `token_*`
//   commands and sent explicitly on refresh. This replaced the OS keychain,
//   which re-prompted on every unsigned rebuild (see
//   UNIT-P11-desktop-token-file-store.md).
import { isTauri } from "./platform";

export interface RefreshTokenStore {
  save(token: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

/** Token-store entry key (the store file lives in the app data dir, app-side). */
export const TOKEN_ACCOUNT = "refresh-token";

function webCookieStore(): RefreshTokenStore {
  return {
    async save() {
      /* httpOnly cookie is server-managed — nothing to persist */
    },
    async load() {
      return null;
    },
    async clear() {
      /* cleared by the server clearing the cookie on logout */
    },
  };
}

function tauriFileStore(): RefreshTokenStore {
  const getInvoke = async (): Promise<
    <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  > => (await import("@tauri-apps/api/core")).invoke;
  return {
    async save(token) {
      const invoke = await getInvoke();
      await invoke("token_set", { account: TOKEN_ACCOUNT, secret: token });
    },
    async load() {
      try {
        const invoke = await getInvoke();
        return await invoke<string | null>("token_get", { account: TOKEN_ACCOUNT });
      } catch {
        return null; // no entry / store unavailable
      }
    },
    async clear() {
      const invoke = await getInvoke();
      await invoke("token_delete", { account: TOKEN_ACCOUNT });
    },
  };
}

/** Pick the platform-appropriate refresh-token store. */
export function createRefreshTokenStore(): RefreshTokenStore {
  return isTauri() ? tauriFileStore() : webCookieStore();
}

/** App-wide singleton, resolved once for the running platform. */
export const refreshTokenStore: RefreshTokenStore = createRefreshTokenStore();
