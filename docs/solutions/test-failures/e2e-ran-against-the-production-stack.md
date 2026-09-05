---
title: The e2e suite silently ran against the production stack after a plain web build
date: 2026-09-05
problem_type: test_failure
module: apps/e2e, apps/web
severity: high
tags: [playwright, e2e, static-export, next-env, production-data, rate-limit, silent-failure]
---

`apps/e2e/playwright.config.ts` starts the API on **8787** and serves `apps/web/out` on 3000, with a
comment stating that the committed `out/` targets `http://localhost:8787`. It does not, after any
ordinary build.

`NEXT_PUBLIC_API_URL` is **inlined into the bundle at build time** (`apps/web/lib/api-client.ts`),
and `apps/web/.env.production` — which `next build` auto-loads and which exists precisely so the
desktop build reaches the Dockerized backend — sets it to `http://localhost:8788`. So

```
pnpm -r build          # or pnpm --filter @boardly/web build
pnpm --filter @boardly/e2e e2e
```

serves a bundle that talks to the **production** server and its database, while Playwright dutifully
starts an e2e server on 8787 that nothing connects to.

**Nothing about the run looks wrong.** The e2e server boots, the browser loads, `signUp` succeeds,
tests pass. In one session this created 38 accounts and 17 board documents in the production
database before anything gave it away.

**What gave it away was a rate limit.** The e2e `webServer` sets `LOGIN_RATE_MAX=1000` because the
suite logs in once per test; production keeps the default 5/min. So the 6th test in a run failed at
sign-up — and failed as `"invalid email or password"`, because `apps/web/lib/api-client.ts` maps
_every_ non-ok auth response to one generic string, 429 included. The symptom pointed at
credentials; the cause was the wrong backend.

Two diagnostics that settle it in one step:

- Log `x-ratelimit-limit` off `/auth/login` in the browser. The e2e server answers `1000`, the
  production server `5`. The response URL in the same log line names the port the browser is
  actually using.
- `grep -rho "localhost:87[0-9][0-9]" apps/web/out | sort -u` — the built bundle names its backend.

**The fix is a build-time guard, not a convention.** `apps/e2e/global-setup.ts` scans the emitted
chunks before any test runs and refuses to start when `out/` references a `:87xx` origin other than
8787, printing the rebuild command:

```
NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm --filter @boardly/web build
```

A comment in the config could not have prevented this — the comment was already there, and it was
true when it was written. The general shape: **when a test harness depends on a value baked into an
artifact it does not build, it has to verify the artifact, not document the expectation.** Anything
else degrades to "whoever built last decided which database the tests write to".
