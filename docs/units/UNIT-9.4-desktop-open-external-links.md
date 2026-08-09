# UNIT-9.4 — Desktop opens external links (Tauri opener)

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 1).

## What changed

Clicking a link in the card drawer now opens it in the OS default browser on the desktop app, and
in a new tab on web — fixing the desktop bug where links did nothing.

- **JS dep** (`apps/web/package.json`): added `@tauri-apps/plugin-opener` pinned at `2.5.4`.
- **Helper** (`apps/web/lib/open-external.ts`): `openExternal(url)` — bails unless
  `isSafeHttpUrl(url)`; on desktop (`isTauri()`) dynamically imports the opener plugin and calls
  `openUrl(url)` (never throws — try/catch like `notify.ts`); on web calls
  `window.open(url, "_blank", "noopener,noreferrer")`.
- **Links renderer** (`apps/web/components/card/links.tsx`): the `<a>` keeps its `href`/`target`;
  its `onClick` intercepts (`preventDefault` + `openExternal`) **only** when `isTauri()`, so web
  keeps native anchor behavior (cmd/middle-click, new tab).
- **Desktop shell:**
  - `apps/desktop/src-tauri/Cargo.toml`: `tauri-plugin-opener = "2"` (resolved to `2.5.4`).
  - `apps/desktop/src-tauri/src/main.rs`: `.plugin(tauri_plugin_opener::init())`.
  - `apps/desktop/src-tauri/capabilities/default.json`: granted `opener:allow-open-url`.

## Why

- Tauri v2's webview does not hand a `target="_blank"` navigation to the OS browser on its own, so
  desktop links were dead. The opener plugin is the supported way to open a URL externally, and it
  mirrors the existing native-capability pattern (`@tauri-apps/plugin-notification` +
  `tauri-plugin-notification` + a capability grant).
- Intercepting **only** under `isTauri()` fixes desktop without regressing web — the native anchor
  (and its cmd/middle-click affordances) is untouched in the browser.
- The http(s)-only guard keeps the existing XSS posture (`javascript:`/`data:`/app-scheme URLs are
  no-ops, same as the add-link guard).

## How it works

`openExternal` is the single choke point. On desktop it lazy-imports the plugin (so the web bundle
never eagerly loads Tauri code) and swallows any failure. The link `onClick` calls it only on
desktop; on web the browser handles the anchor natively.

## How to test / verify

- **Unit tests (all green):**
  - `apps/web/lib/open-external.test.ts` (hoisted mocks for `isTauri` + the opener module):
    web → `window.open` with `_blank`/`noopener`; desktop → `openUrl`; non-http(s) URLs are a
    no-op on both; a failing opener call is swallowed (resolves, never throws).
  - `apps/web/components/card/links.test.tsx`: a link renders as an anchor with the correct
    `href`/`target` (web opens natively); the existing non-http XSS-guard test still holds.
- **Rust wiring:** `cargo check` in `apps/desktop/src-tauri` finishes successfully with the opener
  plugin registered and the capability resolved; `tauri-plugin-opener 2.5.4` is in `Cargo.lock`.
- **DoD run (Node 22.17.1):** web typecheck clean; lint clean (exit 0); `vitest run` = 422 passed /
  37 skipped; `@boardly/web` build compiles.

---

## Fix (2026-08-09) — the capability grant was missing its URL scope

Desktop links were **still** dead: clicking one in the card drawer did nothing, and the only way to
reach the page was right-click → Copy Link → paste in a browser. This is the "known gap" below
coming true — the runtime click was never exercised, and it never worked.

### Root cause

`tauri-plugin-opener`'s `open_url` command is guarded by **both** a permission and a **URL scope**
(`src/commands.rs` → `scope.is_url_allowed(&url, …)` → `Error::ForbiddenUrl`). `is_url_allowed`
ends in `self.allowed.iter().any(…)`, so an **empty allow list rejects every URL**.

The capability granted the bare `"opener:allow-open-url"`, which enables the _command_ and nothing
else. The scope lives in a separate permission — the plugin's own `allow-default-urls` (bundled into
its `opener:default` set) is what supplies `mailto:*`/`tel:*`/`http://*`/`https://*`. Without it the
allow list was empty, so **every** `openUrl` call rejected with `ForbiddenUrl`… and `openExternal`'s
`catch {}` swallowed it. A permanently-broken feature that logged nothing and looked exactly like a
dead click.

### What changed

- **`apps/desktop/src-tauri/capabilities/default.json`** — `opener:allow-open-url` is now a scoped
  object granting `http://*` + `https://*`, in the same shape already used for `http:default`:

  ```json
  {
    "identifier": "opener:allow-open-url",
    "allow": [{ "url": "http://*" }, { "url": "https://*" }]
  }
  ```

  Scoped explicitly rather than switching to `opener:default`, which would also hand the webview
  `reveal_item_in_dir` and the `mailto:`/`tel:` schemes — none of which the app uses. The `glob`
  patterns are the plugin's own (`allow-default-urls.toml`); `glob::Pattern::matches` defaults to
  `require_literal_separator: false`, so `*` spans the `/`s of a full URL.

- **`apps/web/lib/open-external.ts`** — `openExternal` now returns `Promise<boolean>` instead of
  `void`: `false` when the URL was rejected or the desktop opener call failed. It still never
  throws. The web path always returns `true` — `window.open` with `noopener` returns `null` by spec
  even on success, so its return value can't detect a blocked popup.

- **`apps/web/components/card/links.tsx`** — toasts _"Couldn't open that link"_ when
  `openExternal` reports failure. Silence is what let this ship; a dead click now says so.

- **`apps/web/components/card/markdown-editor.tsx`** — the **description preview** had no external-open
  handling at all: `react-markdown` emitted a plain same-tab `<a href>`, so on desktop clicking a
  link in a description navigated the entire Tauri webview off the app, and on web it navigated the
  board away. A `components.a` override now applies the same rule as the Links list —
  `target="_blank" rel="noreferrer"`, untouched on web (cmd/middle-click preserved), intercepted
  into `openExternal` on desktop. `href` is already protocol-sanitized by react-markdown's default
  `urlTransform` (a `javascript:` URL becomes `href=""`), and `openExternal` re-checks with
  `isSafeHttpUrl`.

### How to verify

- **Unit tests:** `apps/web/lib/open-external.test.ts` (return value per path; a rejected
  `openUrl` — what a missing scope looks like from JS — resolves `false`, never throws);
  `apps/web/components/card/links.test.tsx` (desktop click is `preventDefault`ed and routed to
  `openExternal`; a `false` result toasts); new `apps/web/components/card/markdown-editor.test.tsx`
  (preview anchor attrs; web click left native; desktop click routed; failure toasts;
  `javascript:` link inert). Full `@boardly/web` suite: 356 passed / 48 files. Typecheck + lint clean.
- **Resolved ACL:** after `cargo check`, the scope is baked into
  `target/debug/build/boardly-*/out/capabilities.json` as the `allow` array above (an empty `allow`
  there is the bug's signature).
- **Runtime (the check that was skipped last time):** in `pnpm --filter @boardly/desktop dev`, open a
  card with a link and click it → the OS default browser opens that URL and the Boardly window
  stays on the board. Repeat for a markdown link in the Description **preview** tab. An installed
  `/Applications/Boardly.app` must be **rebuilt** (`pnpm --filter @boardly/desktop tauri:build`) to
  pick up the capability — it is compiled in, not read at runtime.

## Follow-ups / known gaps

- Nothing outstanding for this unit. (Historical note: the original pass shipped without the runtime
  click ever being exercised — "the Rust shell compiles and the capability is granted" was treated as
  sufficient. It wasn't; see the fix above. A Tauri capability grant is not verified until the
  command is actually called in a running window, because scope rejection happens at call time.)
