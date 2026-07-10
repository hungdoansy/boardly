# UNIT 5.3: Theme polish + light theme + responsive pass

- **Plan unit:** 5.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 5)
- **Status:** done
- **Requirements:** R11 (theming / responsive)
- **Dependencies:** all UI units — satisfied
- **Commit(s):** _this unit's commit_
- **Screenshots:** `docs/units/screenshots/UNIT-5.3-dark-wide.png`, `-light-wide.png`,
  `-dark-narrow.png`, `-detail-narrow.png`

## What changed

A light theme, a persisted theme toggle, and a responsive pass — plus a security hardening of the
Unit 5.2 desktop unfurl path surfaced during review.

**Theming:**

- `packages/ui/src/theme.css` — added `:root.light` re-declaring the surface/border/text/accent/
  semantic tokens (dark stays `:root`, the default). Because the whole UI is token-only (no `dark:`
  variants anywhere), the light theme cascades to every component for free. Light accent/semantic
  hues are deepened for AA contrast on white.
- `apps/web/lib/theme.ts` (new) — pure `resolveTheme(pref, prefersLight)`, `applyTheme(theme)`
  (stamps `.dark`/`.light` + `color-scheme` on `<html>`), a persisted preference store
  (`boardly-theme` = `dark`|`light`|`system`; `system` follows `prefers-color-scheme` and
  live-updates via a `matchMedia` listener), and a `useTheme()` hook.
- `apps/web/components/app/theme-toggle.tsx` (new) — a sidebar Sun/Moon button that flips
  dark↔light (a persisted manual choice).
- `apps/web/app/layout.tsx` — an inline **no-FOUC** script applies the persisted/OS theme before
  first paint (dark remains the SSR default). Static string, no interpolation.
- `packages/ui` — wired the toggle into the sidebar footer; documented the light tokens in
  `docs/design/DESIGN.md` §2.1.

**Responsive:**

- Sidebar narrows on small screens (`w-52 sm:w-60`); the ⌘K hint is `hidden sm:flex`.
- The board already scrolls horizontally (`overflow-x-auto`); the card detail Sheet is
  `w-full max-w-md`, i.e. **full-screen below 448px** and a right panel above — verified at 380px.

**Security (review follow-up on Unit 5.2):**

- `packages/domain/src/links/registry.ts` — new pure `isPublicHttpUrl(url)`: an SSRF pre-filter for
  the desktop native unfurl (which bypasses the server's DNS-resolving guard). Requires **HTTPS** and
  rejects `localhost`/`*.local`/bare single-label hosts and private/loopback/link-local IP literals
  (incl. `169.254.169.254` cloud metadata, IPv6 `::1`/`fe80:`/`fc00::/7`).
- `apps/web/lib/unfurl-client.ts` — `unfurlViaTauri` now returns null unless `isPublicHttpUrl` passes
  (before touching the network).
- `apps/desktop/src-tauri/capabilities/default.json` — the `http:default` scope dropped `http://*`;
  now **`https://*` only** (no plaintext to arbitrary hosts).

## Why

- **Tokens-only theming means one switch flips everything.** No component knows about "dark" vs
  "light"; they consume semantic vars. Re-declaring the ramp under `.light` is the entire theme —
  minimal surface, no per-component work, no drift.
- **Dark stays the priority/default.** SSR renders `.dark`; the inline script only moves
  light-preferring users, so the no-JS and first-paint experience is the intended dark aesthetic.
- **`system` + manual, persisted.** Matches how people expect OS themes to work, with an explicit
  override that sticks (localStorage) and live-updates when following the OS.
- **Defense-in-depth for desktop unfurl.** The web path is server-guarded; the desktop native fetch
  is not, so a syntactic public-HTTPS pre-filter + an HTTPS-only capability close the direct SSRF /
  plaintext vectors (DNS-rebinding remains a documented residual, as the webview can't resolve DNS).

## How to test / verify

Node: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`. Rust: `export PATH="$HOME/.cargo/bin:$PATH"`.

- **Unit (web):** `pnpm --filter @boardly/web test` — `theme.test.ts` (`resolveTheme`; `applyTheme`
  stamps exactly one class + color-scheme; `setThemePreference` persists + applies);
  `unfurl-client.test.ts` gained a case that the desktop path refuses a private/loopback host and
  plaintext (no fetch). **117 web tests pass** (was 113).
- **Unit (domain):** `pnpm --filter @boardly/domain test` — `isPublicHttpUrl` (public https allowed;
  http/localhost/`*.local`/bare host/private+loopback+link-local IPs rejected; public IP allowed).
  **65 domain tests pass** (was 60).
- **e2e (Playwright, server + build):** toggled dark↔light (persists), selected a populated board,
  and captured **dark-wide**, **light-wide**, **dark-narrow** (620px — sidebar narrows, board
  scrolls horizontally, ⌘K hidden), and **detail-narrow** (380px — the card detail is full-screen).
  Reviewed against `DESIGN.md` (Linear-style, both themes calm/high-contrast).
- **Desktop config still compiles:** `cd apps/desktop/src-tauri && cargo check` → Finished (the
  tightened capability re-validates).
- **Gates:** `pnpm -r typecheck`, `pnpm -r lint`, `pnpm format:check`, `pnpm --filter @boardly/web
build`, full `pnpm -r test` — all green.

## Follow-ups / known gaps

- **A three-way (system/light/dark) toggle UI** — the store supports `system`, but the button only
  flips dark↔light; a small menu could expose "System" explicitly.
- **Contrast audit:** values target AA; a formal automated contrast check lands with the a11y sweep
  (Unit 5.4).
- **Very small screens (<380px)** aren't specifically tuned; the board + full-screen detail are
  usable, but a mobile-first sidebar drawer is out of scope (no mobile app — plan §Non-Goals).
- **DNS-rebinding** on desktop unfurl remains a documented residual risk (webview can't resolve DNS
  to re-check post-connect).
