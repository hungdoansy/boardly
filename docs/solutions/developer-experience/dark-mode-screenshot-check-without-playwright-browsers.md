---
title: Dark-mode screenshot check when no Playwright browsers are installed
date: 2026-08-06
problem_type: developer-experience
module: apps/e2e, apps/web
severity: medium
tags: [playwright, screenshots, dark-mode, verification, definition-of-done, esm]
---

Every user-facing unit is supposed to ship with a dark-mode screenshot check (`CLAUDE.md` §6). That
normally means the e2e suite — which is expensive to get running: it wants a build into
`apps/web/out`, the Docker db, and ports 3000/8787 it refuses to share (`reuseExistingServer: false`).
Worse, a machine can have the workspace's `@playwright/test` installed and still have **no browsers**:
if `~/Library/Caches/ms-playwright` is absent, `chromium.launch()` dies with _"Executable doesn't
exist … chrome-headless-shell"_ and the Playwright MCP with _"Browser is not installed"_. Installing
them is a ~150MB download.

For a _visual_ check — as opposed to regenerating a committed baseline — none of that is needed.
Launch the Google Chrome that is already on the machine:

```js
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
```

Point it at `next dev` on :3000 (which picks up source edits, unlike the static `out/` build the e2e
config serves) and log in as the seeded demo account — `demo@boardly.app` / `demo-boardly-2026`, see
`packages/sync/scripts/seed-demo-board.ts`. The dev API on :8787 can be the one already running; no
port conflict, because nothing is being started twice.

Two gotchas that cost time:

- **A scratch script under `/tmp` cannot resolve workspace deps.** Node resolves `node_modules` from
  the _script's_ directory, not the cwd, so `import { chromium } from "@playwright/test"` throws
  `ERR_MODULE_NOT_FOUND` no matter where you `cd` first. Import the absolute path under
  `node_modules/.pnpm/@playwright+test@<version>/…/index.js` — and note it is **CJS**, so
  `import pw from "…"; const { chromium } = pw;` is required; a named import fails with
  _"Named export 'chromium' not found"_.
- **`page.locator("header")` is not unique.** Every board column renders a `<header>`, so a strict-mode
  violation reports nine matches. Use `.first()` for the app header.

This does **not** replace the e2e suite for baselines. `toHaveScreenshot` comparisons are rendered by
the pinned bundled Chromium; a screenshot taken through `channel: "chrome"` will not match a committed
`*-chromium-darwin.png` and must never be written over one. Any change that moves UI inside a
baselined screenshot still needs `npx playwright install chromium` plus a real
`pnpm --filter @boardly/e2e e2e -u` run. See the memory note `boardly-e2e-verification` for running
that suite around ports another session is holding.
