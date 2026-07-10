# UNIT 3.7: Link-unfurl endpoint (web)

- **Plan unit:** 3.7 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R7
- **Dependencies:** 3.1 (server), 2.7 (links) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

A server-side unfurl endpoint that fetches a page's title + favicon (bypassing browser CORS), guards
against SSRF, and caches by URL — plus wiring so generic link chips populate their titles.

- `apps/server/src/routes/unfurl.ts` — `GET /api/unfurl?url=`:
  - `normalizeUrl` (http(s) only, drops fragment).
  - **SSRF guard** `isBlockedIp` / `assertFetchableUrl`: literal-IP hosts are checked directly;
    names are DNS-resolved and **every** returned address must be public (blocks loopback / RFC-1918
    / link-local incl. `169.254.169.254` / CGNAT / ULA / multicast, IPv4 and IPv6 incl. mapped).
  - `fetchHtml`: 5 s timeout, 512 KiB size cap, `redirect:"manual"` with **per-hop re-validation**
    (≤3 hops), `text/html` only.
  - `parseMetadata`: OpenGraph `og:title` → `<title>`; `og:image` → `<link rel=icon>` →
    `/favicon.ico`, ignoring `data:`/non-http icon hrefs.
  - Caches in `link_metadata_cache` (upsert, 7-day freshness); a cache hit skips the network.
  - Graceful fallback: on fetch failure/timeout returns `200 {title: hostname}` (never a 500);
    SSRF/invalid → `400`.
- `apps/server/src/app.ts` — mounts `/api/unfurl` when `database` is present.
- `apps/web/lib/unfurl-client.ts` — points at `${API_BASE_URL}/api/unfurl` (split-origin dev).
- `apps/web/lib/use-board.ts` — `useLinkActions.add` is now async: for **generic** links it calls
  `unfurl(url)` and passes the resolved `title` to `addLink` (known providers keep their short label).
- Tests: `apps/server/src/routes/unfurl.test.ts`.

## Why (decisions)

- **SSRF is the crux; validate the resolved IP, not just the string.** A hostname can resolve to a
  private address, so names are resolved and every address checked; literal IPs are checked directly
  without a lookup (so a blocked literal never even hits DNS). Redirects are followed manually and
  re-validated each hop — a public URL can't 302 to `http://169.254.169.254`.
- **Timeout + size cap + html-only.** Bounds the work an attacker/large page can cause; the body is
  read through a capped reader (never buffering an unbounded response).
- **Graceful fallback, never 500.** An unreachable link must not break the card — the endpoint
  returns the hostname as a title, and the client falls back to the short label on any error.
- **Cache by normalized URL.** Cheap repeat loads and fewer outbound fetches; 7-day freshness so
  titles aren't frozen forever. Failures are not cached.
- **Regex parsing, no cheerio.** Title/favicon extraction is small and well-scoped; a full HTML
  parser isn't worth the dependency weight for two fields.
- **Unfurl only generic links.** Slack/Linear/GitHub/Claude already render a good short label
  (Unit 2.7); skipping the round-trip for them avoids needless fetches.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (always):** `isBlockedIp` over a matrix of private/public v4+v6 addresses; `normalizeUrl`
  rejects `javascript:`/`data:`/invalid; `assertFetchableUrl` (mocked lookup) rejects a name
  resolving to a private IP and a literal blocked IP (without resolving); `parseMetadata`
  (og:title/`<title>`, favicon/`/favicon.ico`, entity decode).
- **Integration (Docker, real db, mocked fetch/lookup):** `GET /api/unfurl` returns `{title,iconUrl}`
  then serves the **second call from cache** (fetch called once); a failing fetch → `200
{title: hostname}`; **literal loopback/metadata and DNS-to-private → `400` without fetching**;
  non-http scheme → `400`. 60 server tests pass.
  ```sh
  docker compose up -d db
  DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly pnpm --filter @boardly/server test
  ```
- **Live (dark, server + build):** `curl` of `https://example.com` → `{"title":"Example Domain",
"iconUrl":"https://example.com/favicon.ico"}`; a repeat is cached; `http://127.0.0.1:5433/` → 400.
  In the app, adding `https://example.com` to a card's Links populated the chip as **"Example
  Domain"** (detail sheet + card face). Screenshot: `docs/units/screenshots/UNIT-3.7-unfurl-dark.png`.
- **Gates:** `pnpm -r typecheck` (7/7), `pnpm -r lint` (7/7), `pnpm -r test`, `pnpm --filter
@boardly/web build`, `pnpm format:check` — all green.

## Follow-ups / known gaps

- **DNS-rebinding TOCTOU:** the host is validated then fetched (a name could re-resolve between the
  check and connect). Full mitigation needs an agent that pins the validated IP on connect; deferred
  and noted. Redirect hops are re-validated, which covers the common vector.
- **Desktop** swaps in a native CORS-free fetch (Unit 5.2); the client abstraction already isolates
  this behind `unfurl()`.
- **Cache eviction/refresh** beyond the 7-day TTL (e.g. background revalidation) is a later nicety.
- Default `board` columns briefly render empty immediately after creation in a synced session (a
  render-timing artifact observed during verification, not a data issue) — worth a look with the
  4.x board views.
