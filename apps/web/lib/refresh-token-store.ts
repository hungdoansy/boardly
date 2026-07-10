// Where the refresh token lives, per platform (Unit 5.2).
//
// - Web: the refresh token is an httpOnly, SameSite cookie the JS never sees;
//   there is nothing to store client-side, and `/auth/refresh` relies on the
//   cookie (credentials: "include"). All ops are no-ops; `load` returns null.
// - Desktop (Tauri): cookies don't span the native origin ↔ API, so the token
//   is kept in the OS keychain (Keychain / Credential Manager / libsecret) via
//   the app's `keyring_*` commands and sent explicitly on refresh. NOT
//   Stronghold (per plan).
import { isTauri } from "./platform";

export interface RefreshTokenStore {
  save(token: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

/** Keychain entry account name (service is set app-side in the Rust command). */
export const KEYRING_ACCOUNT = "refresh-token";

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

function tauriKeychainStore(): RefreshTokenStore {
  const getInvoke = async (): Promise<
    <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  > => (await import("@tauri-apps/api/core")).invoke;
  return {
    async save(token) {
      const invoke = await getInvoke();
      await invoke("keyring_set", { account: KEYRING_ACCOUNT, secret: token });
    },
    async load() {
      try {
        const invoke = await getInvoke();
        return await invoke<string | null>("keyring_get", { account: KEYRING_ACCOUNT });
      } catch {
        return null; // no entry / keychain unavailable
      }
    },
    async clear() {
      const invoke = await getInvoke();
      await invoke("keyring_delete", { account: KEYRING_ACCOUNT });
    },
  };
}

/** Pick the platform-appropriate refresh-token store. */
export function createRefreshTokenStore(): RefreshTokenStore {
  return isTauri() ? tauriKeychainStore() : webCookieStore();
}

/** App-wide singleton, resolved once for the running platform. */
export const refreshTokenStore: RefreshTokenStore = createRefreshTokenStore();
