# UNIT 3.4: Web auth UI + session wiring

- **Plan unit:** 3.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R9, R11
- **Dependencies:** 3.3 (auth API), 0.4 (web scaffold) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

Login/signup screens and client session handling that gates the board app, wired to the Unit 3.3
auth API.

- `apps/web/lib/auth-store.ts` — in-memory session store (`useSyncExternalStore`): access token
  lives **only in memory** (never localStorage), `userId` is derived from the JWT `sub`
  (`decodeJwtSub`), status is `loading | authenticated | anonymous`. Singleton `authStore` +
  `useAuthSession()` hook.
- `apps/web/lib/api-client.ts` — `createApiClient({ baseUrl, fetch, store })` (injectable for tests)
  - singleton `apiClient`: `signup`, `login`, `refresh`, `bootstrap`, `logout`, and `authFetch`
    (attaches `Bearer`, on `401` refreshes **once** and retries, else clears the session). Base URL
    from `NEXT_PUBLIC_API_URL` (baked at build, default `http://localhost:8787`).
- `apps/web/components/auth/auth-form.tsx` — shared `react-hook-form` + `zod` form (email/password).
- `apps/web/components/auth/auth-gate.tsx` — `AuthGate` (bootstraps a silent `/refresh`; renders a
  spinner while loading, redirects anonymous → `/login`, renders the app when authenticated) and
  `useRedirectIfAuthenticated()` for the auth pages.
- `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx` — the two screens; `app/page.tsx`
  now wraps `WorkspaceApp` in `AuthGate`.
- `apps/web/components/app/workspace-app.tsx` — sidebar footer shows the account + a **Sign out**
  button (`apiClient.logout()`; the gate then redirects to `/login`).
- **Server:** `@fastify/cors` (credentialed, origin-allow-listed via `CORS_ORIGINS`) so the browser
  can call the API cross-origin and receive the httpOnly refresh cookie; `post()` in the client omits
  `content-type` on empty-body requests (Fastify 400s otherwise — caught live).
- Deps pinned: `react-hook-form 7.81.0`, `@hookform/resolvers 5.4.0`, `zod 4.4.3` (web);
  `@fastify/cors 11.3.0` (server).
- Tests: `apps/web/lib/auth-store.test.ts`.

## Why (decisions)

- **Access token in memory, refresh in an httpOnly cookie.** The token an attacker would want is
  never in JS-readable storage; on reload it's simply re-obtained by a silent `/refresh` using the
  cookie. This is the R11/security posture from Unit 3.3 carried to the client.
- **`userId` derived from the JWT `sub`.** `refresh` returns only an access token (no body identity),
  so decoding `sub` gives a uniform identity source for both `login` and `refresh` — no separate
  round-trip, no reliance on the login-only `userId` field.
- **`authFetch` refreshes exactly once.** A single 401→refresh→retry avoids infinite loops; if the
  refresh or the retry still fails, the session is cleared (→ gate redirects to login). This is the
  plan's mid-session-401 edge case, unit-tested.
- **`AuthGate` + `useRedirectIfAuthenticated` share one bootstrap.** Both call `bootstrap()` once;
  the gate protects the app, the hook bounces already-signed-in users off the auth pages.
- **Uniform signup on the client too.** Because the server's signup is non-enumerating, the signup
  page just signs up then logs in with the same credentials — working whether or not the email was
  new, and surfacing only the generic error on failure.
- **CORS was required, not optional.** A browser at the web origin calling the API origin with
  credentials needs `credentials:true` + an explicit origin allow-list (never `*`). Added at the
  server so the wired flow actually works; same-site localhost ports let the `SameSite=Lax` cookie
  flow in dev.
- **Static-export friendly.** `/login` and `/signup` are prerendered routes; all auth logic is
  client-side (`"use client"`), navigation via `next/navigation` — no SSR/route-handlers.

## Design (UI)

Linear-style, dark-first (`docs/design/DESIGN.md`): a centered ~`max-w-sm` column on `bg-canvas`,
the app glyph, a title, tokenized inputs with an `--accent` focus ring, a full-width primary button,
and a muted footer link between login/signup. Errors render inline (field-level from zod, plus a
generic root error). Screenshots: `docs/units/screenshots/UNIT-3.4-login-dark.png`,
`UNIT-3.4-signup-dark.png`.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit:** `pnpm --filter @boardly/web test` — `auth-store.test.ts`: store starts `loading`; derives
  `userId` from `sub`; `clear()` goes anonymous + notifies; login stores/omits token on
  success/401; `bootstrap` → authenticated/anonymous; `authFetch` refreshes once then retries with
  the new token, and clears the session when the refresh also fails. 92 web tests pass.
- **e2e (live, dark, Docker + server):** started `docker compose up -d db`, the Fastify server
  (`CORS_ORIGINS=http://localhost:4321`), and the static build on `:4321`. Verified: **signup →
  auto-login → app**; **reload → silent `/refresh` keeps the session** (stays on the app, no
  redirect); **Sign out → back to `/login`**; **wrong password → generic "invalid email or
  password"** with no redirect. Login/signup screenshots captured.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`, `pnpm --filter
@boardly/web build` (`/`, `/login`, `/signup` prerendered), `pnpm format:check` — all green.

## Follow-ups / known gaps

- **Board data is still local per-browser (IndexedDB).** Server-side board persistence + multi-device
  sync arrive with Hocuspocus (3.5/3.6); this unit only gates the app and manages the session.
- **Account display** shows a derived initial + "Account" (the client has the `userId`, not the
  email). A `/auth/me` (or an email claim) can populate a real identity later.
- **`CORS_ORIGINS` / `NEXT_PUBLIC_API_URL`** must be set per environment for production; dev defaults
  target localhost.
- **Access-token expiry mid-request** is handled by `authFetch`, but there is no proactive refresh
  timer yet; added if UX needs it once real API calls exist.
