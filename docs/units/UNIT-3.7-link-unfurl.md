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
  - Graceful fallback: on fetch failure/timeout/non-2xx returns `200 {}` — no title, never a 500 —
    so the chip keeps its short label (originally `{title: hostname}`; see the 2026-11-03 follow-up).
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
  returns no title, and the chip renders its short label (for a generic link, that is the hostname).
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

### 2026-11-03 — unfurl no longer skips the brand-only providers (four fixes)

Found by auditing a real board: of 116 stored links, **45 showed no page title**. Four separate
defects, fixed together; `docs/solutions/ui-bugs/link-chips-show-a-brand-word-instead-of-a-page-title.md`
has the investigation.

1. **The round-trip was gated on `provider === Generic`.** Every recognised provider skipped the
   unfurl, including the ~33 whose `shortLabel` is a constant that ignores the URL — so a pasted
   YouTube link could only ever render the word `YouTube`. The registry now carries an explicit
   `labelIsBrandOnly` flag (set by `staticProvider(...)` and by `confluence`), and
   `wantsUnfurl(url)` is the single gate the call site in `apps/web/lib/use-board.ts` consults.
   A `registry.test.ts` case asserts the flag matches `shortLabel.length === 0` for every provider,
   so a new `staticProvider` entry cannot silently miss it.
   `claude` is a deliberate opt-out: `claude.ai` is behind a Cloudflare interstitial, so its
   hand-written `session →` is strictly better than anything a fetch returns.
2. **The 512 KB read cap truncated large SPA shells.** YouTube's watch page is ~1.39 MB with its
   `<head>` starting around byte 760,000, so the body was cut before any `og:title`. `readCapped`
   now stops at `</head>` (decoding incrementally, advancing the search offset so the scan stays
   linear) with a 2 MB backstop. Verified live through the route: the YouTube URL now returns
   `"Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)"`.
3. **Numeric HTML entities were never decoded.** Both unfurl paths kept their own six-entry entity
   table, so any non-ASCII title rendered as raw markup (`CH&#x1ee2; GAMING GEAR`). Decoding and the
   title guard now live once in `packages/domain/src/links/title.ts`
   (`decodeHtmlEntities`, `usableTitle`), used by the server route and the desktop-native parse —
   `apps/server` gained a `@boardly/domain` dependency for this. The same decode applies to icon
   hrefs, which were storing a literal `&amp;` for any `og:image` with query parameters.
4. **A fetched title is not automatically better than the short label.** Real responses include
   Cloudflare's `"Just a moment..."`, `"Security Check | Wellfound"`, `"Not Found"`,
   `"404: Page not found"`, and LinkedIn job pages answering with the bare string `"LinkedIn"`.
   `usableTitle` drops those — matching the whole title and its first `|`-delimited segment against
   a table of interstitials, an anchored status-code/reason pattern, and the provider's own short
   label — and falls back to `shortLabel`. It also strips separator debris from half-empty title
   templates (`"| Vishwas Gopinath"` → `"Vishwas Gopinath"`).

**Verified** with `pnpm -r test` (905 passing: domain 215, server 75, web 421, sync 107, commands
61, ui 14, mcp 7, logo 5), `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r build` — all green — and in
the running app (dev server on 8787 against `boardly-dev-db`, web on 3000, dark mode). Pasting the
three URLs into a card's Links gives:

![brand-only providers now unfurl](screenshots/UNIT-3.7-brand-only-unfurl-dark.png)

- `youtube.com/watch?v=dQw4w9WgXcQ` → _Rick Astley - Never Gonna Give You Up (Official Video) (4…_
- `open.spotify.com/track/…` → _Never Gonna Give You Up_
- `claude.ai/chat/…` → _session_ — the opt-out holding; the Cloudflare interstitial never lands.

The provider icon still renders beside each label, so replacing the brand word costs no brand
signal.

**Follow-up fix (same day): the failure fallback no longer stores the hostname.** Reviewing the
change above found a web-only regression. On a failed fetch or non-2xx answer the route sent
`{title: url.hostname}`. That was harmless while only generic links were unfurled (their short
label is the hostname anyway), but once brand-only providers were routed through it, a bot-blocked
page — LinkedIn's 999, Behance's 403, a timeout — stored `"www.linkedin.com"` as the title, and
`linkLabel` prefers a title, so the chip went from `LinkedIn` to `www.linkedin.com`. Desktop never
had this (`unfurlViaTauri` returns `null` on `!res.ok`), so the platforms also disagreed. The route
now answers `200 {}`; `unfurlViaServer` passes that through with no `title`, `updateLinkTitle` is
skipped, and the chip keeps its label. Tests: `unfurl.test.ts` "returns no title when the fetch
fails" (was "falls back to the hostname") and "returns no title for a non-2xx answer".

**Backfill script for links stored before the fix (`apps/server/src/scripts/backfill-link-titles.ts`).**
Fixing the gate only helps links pasted afterwards. The script re-unfurls the ones already on a
board:

```bash
BOARDLY_API_URL=http://localhost:8788 BOARDLY_TOKEN=<access token> \
  pnpm --filter @boardly/server backfill:link-titles            # dry run: prints the plan
# ...then the same command with `-- --apply` to write
```

- **Reads and writes through the command API**, the same path as the MCP server (`BOARDLY_API_URL` /
  `BOARDLY_TOKEN`, a 15-minute access token from `POST /auth/login`): `exportBoard` to read,
  `updateLinkTitle` per link to write. The write goes through the command layer against the live
  Hocuspocus doc, so it persists and broadcasts to open clients like a UI edit. Writing the Yjs
  `bytea` directly was rejected: a doc the server holds in memory would overwrite it on its next
  store.
- **Targets:** links where `wantsUnfurl(url)` is true and the stored title is missing, rejected or
  rewritten by `usableTitle` (raw entities, interstitials, the bare brand word), or equal to the
  hostname the route used to return on failure. `--all` re-checks every unfurlable link instead.
- **Fetch:** the route's own `fetchHtml` (now exported, with an optional `userAgent`), so SSRF
  re-validation per hop, the `</head>` stop and `usableTitle` all apply. It tries `BoardlyBot/1.0`
  first and retries with a browser user agent only when that yields nothing usable (the audit found
  LinkedIn answering the bot with the bare word "LinkedIn"). Each attempt is capped at 20 s, since
  `fetchHtml`'s 5 s abort covers only the headers.
- **Unreachable keeps what it has.** Non-2xx, dead host, or no usable title: the link is left as it
  is. The one exception is a stored title that only needed entity decoding
  (`CH&#x1ee2;` → `CHỢ`), which is repaired locally.
- **Verified:** 9 unit tests (`backfill-link-titles.test.ts`: target selection, the outcome rules,
  the local entity repair). End-to-end against the dev server on a seeded 7-link card: the YouTube
  link fetched its real title, the entity title was repaired, the LinkedIn/Behance/dead-host links
  were kept, the GitHub and already-titled links were not touched, and a second run found nothing to
  do. A read-only preview over the production link dump targets 44 links: 29 get a title (YouTube,
  LinkedIn posts and jobs, Facebook, Wellfound) and 15 are kept (8 LinkedIn job pages and 3
  Wellfound pages refuse both user agents, plus Binance, micro1 and dittowords pages with no usable
  title).
- **Known gaps:** a stored title that is junk _and_ unreachable (an old hostname fallback, a bare
  "LinkedIn") can't be cleared, since no command removes a title. Every write bumps the card's
  `updatedAt`, as a paste-time unfurl does, so an "updated" sort moves those cards up. LinkedIn
  rate-limits unpredictably, so a later rerun may resolve some of the kept job pages.

**Still open after this change:**

- **No re-unfurl in the app.** `updateLinkTitle` has one in-app call site, inside `add`, so the title
  is fetched exactly once at paste time and a transient failure is permanent. Already-stored links
  are covered by the one-shot backfill script below; an in-app "refetch title" affordance is still
  open.
- **Providers with a _derived_ label that sometimes collapses** still skip the round-trip: an
  id-only Notion page renders its 32-hex id, `figma.com/file/<id>` with no slug renders the id,
  `stackoverflow.com/q/<n>` renders `"Stack Overflow"`, and a Linear _project_ URL renders
  `"Linear"`. The per-provider fix is to let those opt into `labelIsBrandOnly` per URL rather than
  per provider.
- **Hosts that block the bot UA.** `tiktok.com` returns a 1.4 KB stub and `behance.net` a 403 to
  `BoardlyBot/1.0`; 7 LinkedIn job pages answer only a browser-like UA. These need oEmbed or a UA
  change, not a bigger buffer.
- **The desktop path still never populates `link_metadata_cache`** (the production cache table is
  empty despite dozens of fetched titles), so desktop re-fetches on every add.
- **Multiple URLs pasted as one string** are stored verbatim; `new URL()` accepts the
  space-separated run, percent-encodes the spaces, and the fetch 404s.

- **DNS-rebinding TOCTOU:** the host is validated then fetched (a name could re-resolve between the
  check and connect). Full mitigation needs an agent that pins the validated IP on connect; deferred
  and noted. Redirect hops are re-validated, which covers the common vector.
- **Desktop** swaps in a native CORS-free fetch (Unit 5.2); the client abstraction already isolates
  this behind `unfurl()`.
- **Cache eviction/refresh** beyond the 7-day TTL (e.g. background revalidation) is a later nicety.
- Default `board` columns briefly render empty immediately after creation in a synced session (a
  render-timing artifact observed during verification, not a data issue) — worth a look with the
  4.x board views.
