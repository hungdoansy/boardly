# @boardly/e2e — Playwright end-to-end + visual baselines

Run: `pnpm --filter @boardly/e2e e2e` (append a spec name to scope, e.g. `… e2e focus-mode`).

## How the harness is wired (`playwright.config.ts`)

- **Two servers, started by Playwright, `reuseExistingServer: false`:**
  - web — `npx serve ../web/out` on **:3000** (serves the **static export**, _not_ a dev server;
    no `-s`, because the app is multi-page + hash-routed).
  - API — `@boardly/server` on **:8787**, with `LOGIN_RATE_MAX=1000` (production keeps the 5/min
    limit; the suite signs up/logs in many times from one IP).
- **Postgres:** Docker `boardly-db` on host **:5433**; `DATABASE_URL` defaults to
  `postgres://boardly:boardly@localhost:5433/boardly`. Bring the DB up first.
- **`colorScheme: "dark"`** by default; snapshots live in `snapshots/`.

## Gotchas (learned the hard way)

- **Serve the build, not source.** The config serves `apps/web/out`, so **`pnpm --filter
@boardly/web build` first** or your source changes won't be reflected.
- **Free the ports.** `reuseExistingServer: false` means a leftover dev server (or another session's
  server) on **:3000/:8787** makes the run fail with "port already used." Kill it first:
  `lsof -ti:3000 | xargs kill; lsof -ti:8787 | xargs kill`.
- **Theme is a `<html>` class, not the OS media query.** For a **light** baseline, toggle in-test
  (`getByRole("button", { name: /Switch to light theme/ }).click()`) — don't rely on `colorScheme`.
- **Poll transitioning styles.** Values behind a CSS `transition` (e.g. a `filter`) read as the
  _start_ frame if sampled immediately. Use `await expect.poll(() => …)`, not a bare `await …`.
- **Scope screenshots to avoid drift.** The sidebar shows a per-run account avatar/initials; snapshot
  `getByRole("main")` (or a specific region), not the whole page, for stable baselines.
- **`--update-snapshots` "fails" on first creation.** It writes the missing baseline and reports the
  test as failed; re-run without the flag to confirm a clean pass, then commit the PNG.
- **Overlays portal to `<body>`.** Radix `Sheet`/`Popover` and dnd-kit `DragOverlay` render outside
  the app tree — so a `filter`/scope on `<main>` doesn't affect them (by design), and…
- **…close the drawer via its Close button.** While a `Sheet` is open the board is `aria-hidden`
  (so `toBeVisible()` on board content fails). Click `getByRole("button", { name: "Close" })` rather
  than guessing how many `Escape` presses it takes.

## Scratch runs against an already-running dev server

To iterate without the full build+serve cycle, run a throwaway spec against a running dev server
with a minimal config (`baseURL: http://localhost:3000`, no `webServer`) via
`--config <scratch>.ts`. Keep committed specs in `tests/` and delete scratch files after. See also
the project memory note `boardly-e2e-verification`.
