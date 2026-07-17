# UNIT 5.2: Tauri plugins (http, notification, deep-link, updater, keyring)

- **Plan unit:** 5.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 5)
- **Status:** done
- **Requirements:** R7 (integrations/unfurl), R9 (reminders/notifications)
- **Dependencies:** 5.1 (Tauri shell), 2.7 (link provider registry / unfurl), 3.4 (auth) — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshot:** none — no new user-facing UI. The desktop wraps the identical, already
  dark-mode-verified web UI; the changes are native plugin wiring + platform-branched behavior.
  Native runtime is a documented **user follow-up**.

## What changed

Wired the desktop-native capabilities and added the web-side platform switches that use them when the
bundle runs under Tauri (detected via `window.__TAURI_INTERNALS__`).

**Web (`apps/web/lib`, platform-branched, unit-tested):**

- `platform.ts` (new) — `isTauri()`.
- `unfurl-client.ts` — switch: **web** → server `/api/unfurl` (SSRF-guarded, Unit 3.7); **desktop**
  → `@tauri-apps/plugin-http` `fetch` (CORS-free, no server round-trip) + a pure `parseUnfurl(html,
url)` that extracts `og:title`/`<title>` and resolves the favicon.
- `refresh-token-store.ts` (new) — `RefreshTokenStore` with `createRefreshTokenStore()`: **web** is a
  no-op (the refresh token is an httpOnly cookie the JS never sees); **desktop** stores/loads/clears
  it in the OS keychain via the app's `keyring_*` commands (`@tauri-apps/api` `invoke`). Not
  Stronghold.
- `notify.ts` (new) — `notify(title, body)`: **desktop** → `@tauri-apps/plugin-notification` (gates
  on permission); **web** → the Notifications API. Never throws.
- `api-client.ts` — takes an injectable `refreshStore` (defaults to the singleton). `login`/`refresh`
  persist a body `refreshToken` when present (desktop) and `refresh` loads + sends it; `logout`
  clears it. **Inert on web** (the server returns no body refresh token there → all no-ops), so the
  web cookie flow is unchanged.
- Deps (exact-pinned): `@tauri-apps/api` 2.11.1, `@tauri-apps/plugin-http` 2.5.9,
  `@tauri-apps/plugin-notification` 2.3.3. Plugin modules are **dynamically imported** inside the
  Tauri branch, so the web build never bundles or executes them.

**Desktop (`apps/desktop/src-tauri`):**

- `Cargo.toml` — added `tauri-plugin-http`, `-notification`, `-deep-link`, `-updater` (v2), the
  `keyring` v3 crate (platform-native backends), and desktop-only `tauri-plugin-single-instance`
  (with `deep-link`). Pinned `notify-rust` to 4.17.0 via `Cargo.lock` (4.18 needs rustc ≥1.89; this
  toolchain is 1.88).
- `src/main.rs` — registers single-instance (first, desktop-only) then http/notification/deep-link/
  updater, and three `#[tauri::command]`s — `keyring_set` / `keyring_get` / `keyring_delete` — backed
  by the `keyring` crate (service = the app identifier).
- `tauri.conf.json` — `plugins.deep-link.desktop.schemes = ["boardly"]`; `plugins.updater` endpoints
  - a real minisign `pubkey` (the private key is discarded — operating a release server is out of
    scope).
- `capabilities/default.json` — grants `core:default`, `http:default` (scoped to `http(s)://*`),
  `notification:default`, `deep-link:default`, `updater:default`. (App-defined `keyring_*` commands
  aren't ACL-gated.)

## Why

- **One bundle, native where it helps.** The web app is unchanged; `isTauri()` gates a few code paths
  onto native APIs. Dynamic `import()` keeps the Tauri plugin JS out of the web bundle entirely.
- **CORS-free unfurl on desktop.** The browser can't fetch arbitrary sites (CORS), so web routes
  through the server; the desktop webview can via `plugin-http`, so it fetches + parses locally — no
  server dependency for link titles (R7).
- **Keychain, not cookies, on desktop.** The native origin ↔ API can't share the web's httpOnly
  cookie, so the refresh token lives in the OS keychain (R-auth); the `api-client` wiring is present
  and inert on web, ready for the desktop server response shape.
- **Deep-link + single-instance.** `boardly://` links must reach the _running_ app, which requires
  single-instance on desktop (registered first, per Tauri docs).
- **`keyring` crate + app commands over a community plugin.** Using the well-maintained `keyring`
  crate with three thin app commands gives a stable, self-owned JS↔Rust contract (`keyring_set/get/
delete`) instead of guessing a third-party plugin's API — same goal (OS keychain, not Stronghold).
  _(Documented deviation from the plan's "tauri-plugin-keyring" wording; intent preserved.)_

## How to test / verify

Node: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`. Rust: `export PATH="$HOME/.cargo/bin:$PATH"`.

- **Platform-switch unit tests (`apps/web/lib/*.test.ts`):**
  - `unfurl-client.test.ts` — `parseUnfurl` (og:title/`<title>`, relative + default favicon); switch
    calls the **web** `/api/unfurl` off-Tauri and the **Tauri** native fetch (no web fetch) under
    Tauri; non-http URLs short-circuit.
  - `refresh-token-store.test.ts` — web store no-ops + `load()===null`; desktop store routes
    save/load/clear through `invoke("keyring_set|get|delete")`; missing entry → null, not throw.
  - `notify.test.ts` — desktop uses the plugin (and requests permission when needed); web uses the
    Notifications API; absent API → false.
  - `auth-store.test.ts` — injected keychain store: `login` stashes a body refresh token, `refresh`
    loads + sends it and persists rotation, `logout` clears it. **113 web tests pass** (was 99).
- **Rust compiles (config + capabilities validated):** `cd apps/desktop/src-tauri && cargo check` →
  **Finished** (Rust 1.88). Compiles all four plugins, single-instance, the `keyring` commands, and
  runs `tauri-codegen` over the config + capability.
- **frontendDist builds:** `pnpm --filter @boardly/web build` → `apps/web/out`. Green.
- **Repo gates:** `pnpm -r typecheck`, `pnpm -r lint`, `pnpm format:check`, `pnpm -r test`
  (mcp 6 / domain 60 / ui 2 / sync 38 / commands 9 / server 71 / web 113) — all green.
- **Native runtime** (keychain round-trip, real notifications, `boardly://` handling, an actual
  update check): a **user follow-up** — needs a built app + signing/release infra.

## Follow-ups / known gaps

- **Superseded — refresh-token storage is no longer the OS keychain.** The `keyring`-backed
  `keyring_set/get/delete` commands documented here were replaced by a `0600` JSON file under the app
  data dir (`token_set/get/delete`), because an unsigned laptop build re-prompts for macOS Keychain
  access on every rebuild. See `UNIT-P11-desktop-token-file-store.md`. The "verify `keyring` linux +
  windows backends" item below is void (crate removed).
- **Desktop auth server shape:** the server must return the refresh token in the `/auth/login` +
  `/auth/refresh` body (and accept it in the refresh body) for desktop; the client is wired but the
  server change is deferred (touches Unit 3.4 auth).
- **Deep-link routing + due-date scheduling:** `onOpenUrl` navigation and scheduling reminders off
  card due dates are runtime concerns wired at native bring-up.
- **Updater/keyring cross-platform features:** verify `keyring` linux (`sync-secret-service`) +
  windows backends on those targets; wire a real release endpoint + signing key at distribution.
- **CSP** still carries broad `https:`/`wss:` (from 5.1) — tighten to the deployed host at release.
