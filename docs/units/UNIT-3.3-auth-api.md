# UNIT 3.3: Auth API (signup / login / logout / refresh)

- **Plan unit:** 3.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R9
- **Dependencies:** 3.2 — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Email/password authentication with argon2id password hashing, EdDSA access tokens, and rotating,
reuse-detecting opaque refresh tokens.

- `apps/server/src/auth/password.ts` — `hashPassword`/`verifyPassword` via `@node-rs/argon2`
  (argon2id, m=19 MiB, t=2, p=1). `verifyPassword` is constant-time (library) and never throws.
- `apps/server/src/auth/tokens.ts` — EdDSA (Ed25519) JWT access tokens (`jose`): `signAccessToken`
  / `verifyAccessToken` (pins `algorithms:[EdDSA]`, checks `iss`/`aud`/`exp`), plus opaque refresh
  tokens (`randomBytes(32)`, base64url) and `hashRefreshToken` (SHA-256, stored at rest).
- `apps/server/src/auth/service.ts` — `createAuthService({ db, keys, config })`: `signup`, `login`,
  `refresh` (rotation + family revocation on reuse), `logout` (family revocation). Generic
  `AuthError` (no enumeration).
- `apps/server/src/auth/routes.ts` — Fastify plugin: `POST /auth/{signup,login,logout,refresh}`,
  `@fastify/cookie` (httpOnly `SameSite=Lax` refresh cookie on `/auth`), `@fastify/rate-limit` on
  login, zod body validation. Refresh token is read from the cookie, a `Bearer` header, or the body
  (desktop path).
- `apps/server/src/{app,index}.ts` — `buildServer` mounts `/auth/*` when an `authService` is passed;
  boot generates an Ed25519 keypair and wires the service.
- `apps/server/src/config.ts` — `NODE_ENV`, `ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS`
  (30), `LOGIN_RATE_MAX` (5), `LOGIN_RATE_WINDOW_MS` (60000); `.env.example` updated.
- Deps pinned: `@node-rs/argon2 2.0.2`, `jose 6.2.3`, `@fastify/cookie 11.1.0`,
  `@fastify/rate-limit 11.1.0`.
- Tests: `password.test.ts`, `tokens.test.ts` (always); `service.test.ts`, `routes.test.ts`
  (real-db, gated on `DATABASE_URL`).

## Why (decisions)

- **Test-first on the security core** (the plan's execution note). Rotation + reuse-detection and
  the generic-error paths were written as the primary specs and drove the service shape.
- **argon2id, tuned.** OWASP's baseline (m=19 MiB, t=2, p=1). Verify is constant-time and swallows
  malformed-hash errors so it can't leak "this hash is/ isn't valid" via an exception.
- **EdDSA JWT for access, opaque token for refresh.** Access tokens are short-lived, stateless, and
  verified by pinning the algorithm — which is exactly what rejects `alg:none` and any substitution.
  Refresh tokens are **opaque and DB-backed** (only their SHA-256 is stored), so they can be revoked;
  a stolen DB row can't be turned back into a usable token.
- **Rotation with family revocation (theft detection).** Each `refresh` revokes the presented token
  and issues a new one in the same `family_id`. Presenting an already-rotated (revoked) token means
  either replay or theft, so the **entire family is revoked** — the attacker and the victim are both
  logged out, which is the safe outcome. Rotation runs in a transaction and only revokes a token
  that is still live, so a race can't mint two successors.
- **No user enumeration.** `signup` always returns the same `201 {ok:true}` (insert
  `onConflictDoNothing`, always hashing for uniform timing). `login` returns one generic
  `invalid email or password` for both unknown-email and wrong-password, and runs a **decoy argon2
  verify** when the email is unknown so response timing doesn't distinguish the two.
- **Login rate-limited** per IP (`@fastify/rate-limit`, route-scoped) to blunt online guessing.
- **Refresh via httpOnly `SameSite=Lax` cookie for web; Bearer/body for desktop.** The cookie keeps
  the refresh token out of JS (XSS-resilient); the Bearer/body path serves the Tauri client.
- **Ephemeral signing keys at boot** (documented follow-up): access tokens are short-lived and
  refresh tokens are DB-backed, so a restart's key rotation only forces a silent refresh. Persisted
  keys for multi-instance are deferred.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (always):** `pnpm --filter @boardly/server test` — `password.test.ts` (argon2id prefix,
  random salt, verify true/false, malformed→false) and `tokens.test.ts` (round-trip; reject
  wrong-key / expired / **alg:none** / tampered payload; refresh-token entropy + SHA-256 hashing).
- **Integration (Docker exercised), gated on `DATABASE_URL`:**
  ```sh
  docker compose up -d db     # (POSTGRES_IMAGE=postgres:16 if 17 can't be pulled)
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
    pnpm --filter @boardly/server test
  ```
  `service.test.ts`: signup→login issues tokens; duplicate signup is uniform and doesn't take over
  the account; unknown-email and wrong-password give the **same** `AuthError`; refresh rotates (new
  works, old dies); **reusing a rotated token revokes the whole family**; logout revokes.
  `routes.test.ts`: login sets an httpOnly `SameSite=Lax` cookie + returns an access token; wrong
  password → generic `401`; malformed → `400`; cookie refresh rotates the cookie and logout clears
  it (and the token then fails); **login is `429` after `LOGIN_RATE_MAX`**. All 29 server tests pass
  against the container db.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test` (server 14 pass + 15
  db-gated skips by default), `pnpm --filter @boardly/server build`, `pnpm format:check` — all green.
  No user-facing UI (that's Unit 3.4), so no Playwright screenshot applies.

## Follow-ups / known gaps

- **Web auth UI + session wiring (3.4)** consumes these endpoints.
- **Persisted/rotated signing keys** for multi-instance deployments (currently ephemeral per boot).
- **Expired/revoked refresh-token GC**: rows accumulate; a periodic cleanup (or partial index) is a
  later optimization. An index on `refresh_tokens.token_hash`/`family_id` should accompany that.
- **Access-token auth middleware** (verifying `Authorization: Bearer` on protected routes) lands with
  the sync/API surface that needs it (3.5+).
