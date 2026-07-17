# UNIT P11: Desktop refresh-token store — file, not OS keychain

- **Plan unit:** P11 (interactive, ad hoc — no dedicated plan file)
- **Status:** done
- **Requirements:** none (bug/UX fix — stop the recurring macOS Keychain prompt)
- **Supersedes:** the storage-backend decision in `UNIT-5.2-tauri-plugins.md` (see its Follow-ups)
- **Commit(s):** <pending>

## What changed

- `apps/desktop/src-tauri/src/main.rs` — replaced the three `keyring`-backed commands
  (`keyring_set` / `keyring_get` / `keyring_delete`) with file-backed ones
  (`token_set` / `token_get` / `token_delete`). Secrets now persist as a JSON `account → secret`
  map in `<app-data-dir>/auth-store.json` (`~/Library/Application Support/vn.moonbase.boardly/`
  on macOS), written via `serde_json`. On unix the file is created owner-only (`0600`) **at
  creation** through `OpenOptions::mode(0o600)` — not write-then-chmod, which would leave a brief
  world-readable TOCTOU window. Absent file = empty map (not an error). `invoke_handler` updated to
  register the renamed commands.
- `apps/desktop/src-tauri/Cargo.toml` — removed the `keyring = "3"` dependency (and its
  `apple-native` / `windows-native` / `sync-secret-service` features). No new deps — `serde` /
  `serde_json` were already present.
- `apps/web/lib/refresh-token-store.ts` — `tauriKeychainStore` → `tauriFileStore`;
  `KEYRING_ACCOUNT` → `TOKEN_ACCOUNT`; the three `invoke("keyring_*")` calls → `invoke("token_*")`.
  The `RefreshTokenStore` interface (`save`/`load`/`clear`) and the web (cookie) branch are
  unchanged, so `api-client.ts` and all callers are untouched behaviorally.
- Tests updated to the new names: `apps/web/lib/refresh-token-store.test.ts` (imports
  `TOKEN_ACCOUNT`, asserts `token_set|get|delete`) and `apps/web/lib/auth-store.test.ts`
  (describe/it wording only — the store there is injected, so no command-name coupling).
- Comment-only touch-ups in `apps/web/lib/api-client.ts` and `apps/web/lib/platform.ts` (they
  described the desktop store as "keychain").

## Why (decisions)

- **Root cause of the recurring prompt.** macOS binds a Keychain item's "always allow" ACL to the
  accessing app's **code signature**. `tauri.conf.json` sets no `signingIdentity`, so the laptop
  build is unsigned / ad-hoc-signed and its signature changes on every rebuild — macOS treats each
  build as a different app and re-prompts; "Always Allow" never sticks. This is inherent to an
  unsigned build using the keychain; the only ways out are (a) a stable Developer ID signature, or
  (b) not using the keychain.
- **File over Developer-ID signing.** Boardly is a personal, single-user, self-hosted, laptop-only
  app (the auto-updater was already removed for the same reason — see UNIT-8.1). Paying for and
  wiring an Apple Developer cert to protect a refresh token to _its own_ self-hosted API is
  disproportionate, and it still wouldn't silence dev/rebuilt binaries. A file store removes the
  prompt permanently, dev and release alike.
- **Trade-off, stated plainly.** The token is no longer OS-encrypted at rest — any process running
  as the same user can read `auth-store.json`. `0600` limits it to the user account; that is the
  accepted posture for this app. If Boardly ever ships as a signed, distributed product, revert to
  a keychain (or Stronghold) store.
- **Kept the `account`-keyed map shape.** Preserving the `{ account: secret }` structure (rather
  than a bare string) keeps the JS `save/load/clear(account)` contract identical and leaves room for
  more than one stored secret without another schema change.
- **Renamed the commands (not a silent re-implementation).** Leaving `keyring_*` names on
  file-backed commands would be a lie in the code; `token_*` matches what they now do.

## How it works

- `token_set/get/delete` take `app: tauri::AppHandle` (Tauri injects it) and resolve the store path
  via `app.path().app_data_dir()` (the `tauri::Manager` trait). Custom app commands registered in
  `invoke_handler` need no capability/permission entry (unlike plugin commands), so no
  `capabilities/*.json` change was required.
- `read_store` returns an empty map when the file is missing (`ErrorKind::NotFound`), so first-run
  `load()` yields `None` cleanly. `write_store` `create_dir_all`s the parent, then on unix opens the
  file via `OpenOptions::mode(0o600)` (owner-only from creation, no write-then-chmod TOCTOU window)
  and writes pretty JSON; non-unix falls back to `fs::write`.
- The JS side is unchanged in shape: on desktop `createRefreshTokenStore()` returns the file store,
  which `invoke`s the Rust commands; on web it stays the no-op cookie store.

## How to test / verify

- `pnpm --filter @boardly/web test refresh-token-store` — desktop branch asserts
  `token_set/get/delete` are invoked with `{ account: TOKEN_ACCOUNT, ... }`, missing-entry `load()`
  returns `null` not throws; web branch stays all-no-op.
- `pnpm --filter @boardly/web test auth-store` — login/refresh/logout wiring against the injected
  store still green.
- `pnpm --filter @boardly/web typecheck` — green (renamed export resolved everywhere).
- `cargo check` / build in `apps/desktop/src-tauri` — compiles without `keyring`; `Cargo.lock` no
  longer resolves the `keyring` crate.
- Manual (native, on macOS): fresh `tauri:build` / launch, log in — **no Keychain prompt**; confirm
  `~/Library/Application Support/vn.moonbase.boardly/auth-store.json` exists with mode `600` and the
  token; quit + relaunch stays logged in; logout empties the entry.

## Follow-ups / known gaps

- No migration from the old keychain entry: an existing user's token stays in the Keychain (orphaned,
  harmless) and they log in once more to seed the file. Acceptable for a single-user app; a one-time
  read-old-keychain-then-write-file shim was intentionally skipped (would reintroduce the `keyring`
  dep and one final prompt). The stale `vn.moonbase.boardly` Keychain item can be deleted manually in
  Keychain Access.
- The token is stored in cleartext (0600). If stronger at-rest protection is ever wanted without a
  Developer ID cert, consider `tauri-plugin-stronghold` (needs a passphrase) — out of scope here.
- If Boardly is later code-signed for distribution, revisit and prefer the OS keychain again.
