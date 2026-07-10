# UNIT 5.1: Tauri v2 shell wrapping the web export

- **Plan unit:** 5.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 5)
- **Status:** done
- **Requirements:** R4 (two platforms, one codebase), R1 (local-first)
- **Dependencies:** 0.4 (web static export) — satisfied; 3.6 (sync config) — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshot:** none new — the desktop shell renders the **identical** `apps/web/out` UI already
  verified in dark mode (Units 1.x–4.x). Native window launch is a documented **user follow-up**
  (plan §"Desktop verification posture").

## What changed

A new `apps/desktop` Tauri v2 project that wraps the Next.js static export in a native window. Shell
only — native capabilities (http/notification/deep-link/updater/keyring) land in Unit 5.2.

- `apps/desktop/package.json` — `@boardly/desktop`; dev dep `@tauri-apps/cli` pinned exact
  (`2.9.2`). Scripts: `dev` (`tauri dev`), `tauri`, `tauri:build`. Deliberately **no `build`
  script** so `turbo run build` / `pnpm build` never trigger a native desktop build in the loop/CI.
- `apps/desktop/src-tauri/tauri.conf.json`:
  - `build.frontendDist = "../../web/out"` (the web static export), `devUrl = http://localhost:3000`,
    `beforeDevCommand`/`beforeBuildCommand` run the web app via pnpm filters.
  - `app.windows[0]`: title **"Boardly"**, 1280×832 (min 720×480), **`useHttpsScheme: true`** so the
    webview origin is stable (`https://tauri.localhost`) across OSes → IndexedDB persists (R1).
  - `app.security.csp`: `default-src 'self'`; `connect-src` allows `'self'`, the dev API/sync
    (`http://localhost:8787`, `ws://localhost:8787`) and `https:`/`wss:` for the user's configured
    sync host + API; `img-src` allows `data:`/`blob:`/`asset:`; `script-src 'self'`.
  - `bundle`: active, all targets, icon set (png/icns/ico).
- `apps/desktop/src-tauri/Cargo.toml` — binary crate `boardly`; deps `tauri` v2, `tauri-build` v2,
  `serde`/`serde_json`; a size-optimized `[profile.release]`. (Cargo pins via committed `Cargo.lock`.)
- `apps/desktop/src-tauri/build.rs` — `tauri_build::build()`.
- `apps/desktop/src-tauri/src/main.rs` — `tauri::Builder::default().run(generate_context!())`, with
  the Windows `windows_subsystem` guard. No plugins yet (5.2).
- `apps/desktop/src-tauri/capabilities/default.json` — base capability granting `core:default` to the
  `main` window (Tauri v2 ACL, not a v1 allowlist).
- `apps/desktop/src-tauri/icons/*` — full icon set generated from a Boardly-accent source (png sizes
  - `icon.icns` + `icon.ico`); mobile (android/ios) icon variants removed (out of scope).
- `.prettierignore` — ignore `apps/desktop/src-tauri/{target,gen}` (machine-generated).

## Why

- **One frontend, wrapped — not forked.** `frontendDist` points straight at `apps/web/out`, so the
  desktop app is the same React/Yjs SPA (R4). No desktop-specific UI in this unit.
- **`useHttpsScheme` for durable local-first storage.** Tauri defaults the Windows webview to
  `http://tauri.localhost`; pinning the https scheme keeps a **stable origin** so `y-indexeddb`
  survives across launches and OSes (R1) — the same code path as web.
- **CSP is opened only for what sync needs.** `connect-src` must reach the `wss://` sync host + auth
  API; everything else stays `'self'`. The dev localhost hosts are listed explicitly; `https:`/`wss:`
  cover a user-configured production host (tightening to a concrete host is a deploy-time follow-up).
- **No `build` npm script** keeps the Rust/native toolchain out of the JS build graph — the overnight
  loop's `pnpm build` stays web-only, matching the plan's "web-first, scaffold desktop" posture.

## How to test / verify

Rust: `export PATH="$HOME/.cargo/bin:$PATH"`. Node: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Config validates + Rust compiles:** `cd apps/desktop/src-tauri && cargo check` → **Finished**
  (Rust 1.88). This runs `tauri-build` + `tauri-codegen`, which parse `tauri.conf.json`, the
  capability, and embed the icons — i.e. the config is validated by the compile.
- **frontendDist builds:** `pnpm --filter @boardly/web build` produces `apps/web/out` (the wrapped
  asset root). Green.
- **Repo gates:** `pnpm -r typecheck`, `pnpm -r lint`, `pnpm format:check`, `pnpm -r test`
  (mcp 6 / domain 60 / ui 2 / sync 38 / commands 9 / server 71 / web 99) — all green. Adding the
  desktop workspace does not perturb the JS pipelines (no `typecheck`/`lint`/`test`/`build` scripts).
- **Native launch** (`tauri dev` / `tauri build` producing a `.app`/`.dmg`): a **user follow-up** per
  plan scope — it needs the platform WebView/signing environment and isn't gated by the loop.

## Follow-ups / known gaps

- **Native run/build + code signing** are a user follow-up (plan §Desktop verification posture).
- **Plugins (Unit 5.2):** `@tauri-apps/plugin-http` (CORS-free unfurl), notification, deep-link,
  updater, and `tauri-plugin-keyring` (refresh-token storage) — plus the web platform switches that
  use them — are added next.
- **CSP hardening:** replace the broad `https:`/`wss:` in `connect-src` with the concrete deployed
  sync host + API origin at release time.
- **`identifier`** is `vn.moonbase.boardly` — adjust before any public distribution.
