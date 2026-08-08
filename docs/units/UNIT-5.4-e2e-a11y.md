# UNIT 5.4: E2E consolidation, screenshot baselines, a11y pass

- **Plan unit:** 5.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 5)
- **Status:** done
- **Requirements:** R12 (quality bar), R2 (perf/keyboard), R8 (activity/history surfaced)
- **Dependencies:** all prior units — satisfied
- **Commit(s):** _this unit's commit_
- **Baseline:** `apps/e2e/snapshots/board.spec.ts-snapshots/board-dark-chromium-darwin.png`

## What changed

A real Playwright suite in `apps/e2e`, run against the **served static build + live server +
Dockerized Postgres**, plus a dark-theme visual baseline and keyboard/a11y checks.

- `apps/e2e/package.json` — `@playwright/test` pinned **1.59.1** (its bundled Chromium headless-shell
  revision 1217 is already cached, so no browser download). Scripts: `e2e` (`playwright test`),
  `e2e:update` (refresh snapshots), plus `typecheck`/`lint`.
- `apps/e2e/playwright.config.ts` — `testDir: tests`, serial (`workers: 1`, one shared server+db),
  chromium project, `colorScheme: "dark"`, snapshots in `snapshots/`. Two `webServer` entries start
  the API (`@boardly/server` on :8787, `DATABASE_URL` + `CORS_ORIGINS=http://localhost:3000` +
  `LOGIN_RATE_MAX=1000` for the many auth calls) and serve the built `out/` on :3000. **No `-s`**:
  the app is multi-page (`/`, `/login`, `/signup`) with hash-routed boards (`/#board/<id>`), so SPA
  rewriting would clobber the real routes.
- `apps/e2e/tests/`:
  - `helpers.ts` — `signUp`/`logIn` (unique email per test), `createBoard` (waits for the seeded
    `To Do`/`Doing`/`Done`), `addColumn`, `addCard`, `openCard` (clicks the inner title button).
  - `auth.spec.ts` — signup→app; anonymous→`/login` redirect; wrong-password generic error;
    logout→login→log back in.
  - `board.spec.ts` — seeded default columns + add a column + cards into columns; **dark visual
    baseline** (`toHaveScreenshot`).
  - `card.spec.ts` — open detail, edit description + priority, activity shows Created/Priority,
    persists across close/reopen (Yjs + IndexedDB).
  - `search.spec.ts` — `/` opens search, filters by title, opens the card.
  - `a11y.spec.ts` — primary controls have accessible names; a card is keyboard-focusable and
    opens/closes with Enter/Escape; theme toggle persists across reload and stamps the root class.
  - `sync.spec.ts` — **two browser contexts, same account, same board** → a column/card created on
    one client converges on the other over the live WebSocket sync (ownership registration → WS
    ticket → Hocuspocus relay → Yjs merge).
- `apps/e2e/.gitignore` — ignore `test-results`/reports; the `snapshots/` baseline is committed.

## Why

- **Real stack, not mocks.** The convergence guarantees (two-client sync, offline→online, auth
  round-trip) can only be proven end-to-end — the suite drives the actual served build against the
  live server + Postgres, matching the plan's "integration coverage mocks won't prove".
- **Cache-matched Playwright pin.** 1.59.1 was chosen specifically because its browser revision is
  already on disk — the suite runs with zero network/browser-download dependency.
- **Boards are hash-routed**, so the static host must serve files as-is (not SPA-rewrite); this also
  keeps `/login` and `/signup` reachable.
- **Deterministic auth headroom.** The login rate-limit (5/min in prod) is lifted to 1000 for e2e
  only via the server env — the suite signs in dozens of times from one IP.

## How to test / verify

Prereqs: Docker `boardly-db` up + migrations applied; Node 22.17.1
(`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`); `DATABASE_URL` exported.

- **Run:** `pnpm --filter @boardly/e2e e2e` → **12 passed** (chromium), ~9s, against the
  auto-started server + served `out/`. Covers auth, board CRUD, card detail + activity, search,
  keyboard/a11y, the dark visual baseline, and live two-client sync.
- **Refresh the baseline** after intentional UI changes: `pnpm --filter @boardly/e2e e2e:update`.
- **Static gates:** `pnpm --filter @boardly/e2e typecheck` + `lint` are green and run in the standard
  `pnpm -r` sweep. The `e2e` run itself is **not** wired into `pnpm -r test` (it needs browsers +
  the live server/db), so the default unit-test gate stays fast and hermetic — run it explicitly.
- **Whole-repo:** `pnpm -r typecheck` / `-r lint` / `format:check` green; unit suites unchanged
  (domain 66 / sync 38 / commands 9 / server 71 / web 117 / ui 2 / mcp 6).

## Follow-ups / known gaps

- **Single browser project (chromium).** Firefox/WebKit projects can be added; chromium is the
  cached, representative engine here.
- **Perf-at-scale spec** (hundreds of cards, drag without jank) is not automated — covered by the
  virtualization/design rules and manual checks; a seeded perf spec is a good future add.
- **Drag-and-drop e2e** isn't included (dnd-kit pointer sequences are covered by unit tests in
  `apps/web`); a pointer-drag spec could be added.
- **CI wiring:** the suite assumes a local Postgres; a CI job would stand up the db service and run
  `e2e` after the web build.
- **Accumulated locator/baseline drift (fixed 2026-08-05).** With no CI job running it, the suite
  silently rotted against later units. Every failure was stale _test_, not app regression:
  - `addCard` matched two "Add card" buttons once UNIT-13 gave the column header a `+` sharing the
    footer composer's `aria-label` → scoped to `column.locator("header")`.
  - `openCard` clicked a `button` named after the card title, but UNIT-9.7 made the whole
    `<article aria-label="Card: …">` face clickable and dropped the inner title button → new
    `cardFace()` helper; same stale locator fixed in `focus-mode.spec`.
  - `a11y`/`auth` expected a top-level "Sign out" button; it now lives behind the sidebar **Account**
    popover → both open the popover first.
  - The `focus-mode` + `list` baselines predated two shipped changes and were re-recorded: the
    focus-mode PNGs still showed the **pre-UNIT-9 user-managed columns** ("To Do"/"Doing"/"Done" +
    "Add column"), and `list-grouped-dark` still showed the legacy `BRD-` short-id prefix, whereas
    an unset `shortIdPrefix` now renders `#N` (`domain/ids.ts` `formatTicketId`). Both diffs read as
    only ~1% of pixels because the region is mostly empty background — **open the diff image before
    trusting a small ratio.** `board-dark` masked the same drift via `maxDiffPixelRatio: 0.03`.
  - `addCard` now parks the cursor (`page.mouse.move(0, 0)`) so a seeded board's column header `+`
    isn't left hovered in every later visual baseline.
- **Rebase onto UNIT-18/19 (2026-08-06)** landed cleanly (no textual conflicts — UNIT-18 shipped
  the identical `addCard` header-scoping fix independently, so that hunk was a no-op merge) but
  broke the just-recorded `focus-mode` baselines: UNIT-18 makes the column `…` menu render on
  **empty** columns too (previously hover/count-gated), so `focus-calm-dark`/`focus-zen-board-dark`
  (+ light) picked up a genuine, intentional extra `…` on Backlog/Pending. Re-recorded after
  confirming the diff against the UNIT-18 unit doc, not on reflex.
