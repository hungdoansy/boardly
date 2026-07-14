# UNIT P9: Dev/build DX — auto-loaded env files, Node pin bumped to 24.15.0

- **Plan unit:** P9 (interactive, ad hoc — no dedicated plan file)
- **Status:** done
- **Requirements:** none (tooling/DX only)
- **Commit(s):** <pending>

## What changed

- `apps/server/package.json` — `dev`/`start` now run `tsx watch|— --env-file-if-exists=../../.env
  src/index.ts`, auto-loading the root `.env` (Node's built-in `--env-file` flag, forwarded by tsx).
  Removed `apps/server/.env` (an unused duplicate of the same values — root `.env` is now the single
  source, read both by `docker compose` and by the server script).
- `apps/web/.env.production` (new, committed) — `NEXT_PUBLIC_API_URL=http://localhost:8788`. Next.js
  auto-loads this for `next build` only (never `next dev`), so `pnpm --filter @boardly/desktop
  tauri:build` bakes in the Docker production backend URL with no manual `export`.
- `.gitignore` — added `!.env.production` (alongside the existing `!.env.example`). Safe to commit:
  `NEXT_PUBLIC_*` vars are baked into the public JS bundle, unlike the real credentials in the
  gitignored `.env`.
- **Node toolchain pin bumped `22.17.1` → `24.15.0`** (`.nvmrc`, root `package.json` `engines.node`,
  `apps/server/Dockerfile` base image `node:24.15.0-slim`, `.claude/launch.json` debug configs). This
  version was chosen because it's already this machine's default node (`nvm alias default` /
  no-nvm-shell `node --version`) — the entire reason for the previous pin's `export
  PATH=".../v22.17.1/bin:$PATH"` requirement (documented in `CLAUDE.md` §4 and the build plan's
  "Execution environment" section) was that the pin diverged from the default. Matching them removes
  that step everywhere it appeared.
- `CLAUDE.md` §4 and `docs/plans/2026-07-09-...-full-build-plan.md` ("Execution environment" /
  "Dependencies" sections — the *live* operational directives the build loop reads, not historical
  unit narrative) updated to state the new pin and drop the `PATH` workaround instruction.
- `docs/GUIDE-local-production.md` — removed every `export PATH=".../v22.17.1/bin:$PATH"` line
  (prerequisites, rebuild, demo seed, dev-mode-against-prod-backend, "developing while using the app")
  and the manual `export NEXT_PUBLIC_API_URL=http://localhost:8788` step before `tauri:build` (now
  automatic via `apps/web/.env.production`).
- Root `.env` / `.env.example` — comments updated to say the server env is auto-loaded, not
  manually exported.

Deliberately **not** touched: the ~80 existing `docs/units/*.md` and other `docs/plans/*.md` files
that mention `22.17.1` as part of describing what was decided/built at the time (e.g. Unit 0.1's
scaffold rationale). Those are historical records, not live instructions — rewriting them would
misrepresent what actually happened in those units.

## Why (decisions)

- **Root `.env` as the single source, not a per-package copy.** `apps/server/.env` and root `.env`
  held the same three keys (`DATABASE_URL`, `PORT`, `HOST`) — a silent-drift risk with zero benefit.
  Node's `--env-file` flag accepts a path, so pointing tsx at `../../.env` (pnpm `--filter` runs
  package scripts with cwd = the package dir) collapses this to one file that also drives
  `docker-compose.yml`'s `POSTGRES_*` interpolation.
- **`--env-file-if-exists`, not `--env-file`.** The Docker image (`apps/server/Dockerfile`) never has
  a `.env` file (`.dockerignore` excludes it — no secrets baked into the image) and gets its env
  entirely from `docker-compose.prod.yml`'s `environment:` block. `--env-file-if-exists` is a no-op
  there instead of a hard failure; `start` (used by `CMD ["pnpm", "start"]`) needed the same treatment
  as `dev`.
- **`apps/web/.env.production` committed, not gitignored.** Everything under `NEXT_PUBLIC_*` ships
  in the client JS bundle regardless — there's no confidentiality to protect, and committing it means
  a fresh clone's `tauri:build` just works instead of silently defaulting to the dev port (`8787`) and
  failing to reach the Docker backend. `next dev` never reads `.env.production`, so this file can't
  leak into local dev by accident.
- **Bump the Node pin to match the machine default, rather than keep forcing `PATH`.** The previous
  pin (`22.17.1`) predated this machine defaulting to `24.15.0`; every session paid a `PATH` export
  tax to reconcile them. Since Next 16 / the rest of the stack run fine on 24.x (verified below) and
  the whole point of pinning is reproducibility, not a specific major, moving the pin to the
  already-installed default removes the tax without giving up the pin.

## How it works

- `tsx` forwards unrecognized flags straight to the underlying `node` binary; `--env-file-if-exists`
  is a native Node 20.6+/22+ flag (docs: `node --help`) that parses a dotenv-syntax file into
  `process.env` before the entry script runs — no `dotenv` dependency needed.
- Next.js's built-in env loading order is `process.env` > `.env.$(NODE_ENV).local` > `.env.local` >
  `.env.$(NODE_ENV)` > `.env`. `next build` sets `NODE_ENV=production` internally, so
  `.env.production` applies there and only there; an inline `NEXT_PUBLIC_API_URL=... pnpm ... build`
  still wins over the file (process.env is highest precedence) for one-off overrides.

## How to test / verify

- `pnpm --filter @boardly/server dev` from a clean shell (no `PATH` export, no inline env vars) —
  boots and logs `listening on http://127.0.2.3:8787`, confirming the root `.env` was picked up.
- `pnpm --filter @boardly/web build` — Next logs `- Environments: .env.production`; grepped the
  output bundle (`apps/web/out/_next/static/chunks/*.js`) for `localhost:8788` and found it inlined
  at the `api-client.ts` base-URL assignment site.
- `pnpm typecheck` / `pnpm build` (full turbo run) green under the new default node (`v24.15.0`, no
  override) — the one failure (`@boardly/e2e` missing DOM lib types in `focus-mode.spec.ts`) is
  pre-existing and unrelated (predates this unit; confirmed via `git log` on that file).
- Not run: an actual `tauri:build` (Rust compile, several minutes) — verified the piece it depends on
  (the web static export baking the right `NEXT_PUBLIC_API_URL`) directly instead, per the mechanism
  test above.

## Follow-ups / known gaps

- `@types/node` is still pinned at `22.20.1` (root `package.json`). Node 22 vs 24 types are additive
  or so for this codebase (nothing broke), but bumping to a `24.x` `@types/node` would be more
  correct long-term — left alone here since it's unrelated to the DX ask and out of scope.
- The pre-existing `@boardly/e2e` typecheck failure (`focus-mode.spec.ts` missing `dom` lib) is
  unrelated to this unit and left as-is; worth a follow-up ticket.
- `docs/plans/2026-07-09-...` still contains historical narrative mentioning `22.17.1` (scaffold
  rationale, directory sketch) outside the "Execution environment"/"Dependencies" sections that were
  updated — intentionally left as a record of the original decision.
