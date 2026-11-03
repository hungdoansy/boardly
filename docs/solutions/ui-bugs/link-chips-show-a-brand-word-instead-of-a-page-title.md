---
title: A pasted YouTube link shows just "YouTube" — unfurl is gated on `Generic`, and a 512 KB cap hides YouTube's own `<head>`
date: 2026-11-03
problem_type: ui_bug
module: apps/web, apps/server, packages/domain
severity: medium
tags:
  [
    link-unfurl,
    opengraph,
    og-title,
    link-provider-registry,
    static-provider,
    read-size-cap,
    youtube,
    url-preview,
  ]
---

**Symptom.** Paste a YouTube watch URL onto a card and the link chip reads `YouTube` — the brand,
never the video title. Same for Spotify, Vimeo, Loom, Miro, Figma, Notion, Confluence and ~30 other
recognised hosts.

**Two independent causes.** Fixing either one alone still leaves YouTube broken, which is what makes
this worth writing down.

1. **Unfurl is gated on the `Generic` provider.** `apps/web/lib/use-board.ts` (`useLinkActions.add`)
   only calls `unfurl(url)` when `detectProvider(url) === LinkProvider.Generic`. The intent was sound
   — "known providers already render a good short label, so they skip the round-trip" — but it is
   false for every `staticProvider(...)` entry in `packages/domain/src/links/registry.ts`, whose
   `shortLabel` is a closure over a constant that ignores the URL. `linkLabel()` is
   `title ?? shortLabelFor(url)`, so with `title` never fetched the chip can only ever be that
   constant. **33 of the 52 registered providers** have such a label; the cheap test is
   `provider.shortLabel.length === 0` — arity 0 means the label cannot depend on the URL. Note
   `confluence` and `claude` are hand-written files, not `staticProvider` calls, and still have
   arity 0, so grepping for `staticProvider` undercounts.

   A second tier _derives_ a label but degrades on ordinary URL shapes: an id-only Notion page
   renders its 32-hex id, `figma.com/file/<id>` with no slug renders the id, `x.com/i/status/…`
   renders `X`, `stackoverflow.com/q/<n>` and `/a/<n>/<m>` render `Stack Overflow`, and a Linear
   _project_ URL renders `Linear`.

2. **The server's 512 KB read cap lands before YouTube's `<head>`.** `MAX_BYTES = 512 * 1024` in
   `apps/server/src/routes/unfurl.ts`. YouTube's watch page is ~1.39 MB and its metadata sits at
   **760–770 KB** (`<title>` at 778,351; `og:title` at 780,228; `</head>` at 788,389) — the entire
   head is past the cap, so `parseMetadata` sees nothing and the route answers with no title. The surprise is that `<head>` is not near the top of a
   modern SPA document; do not assume a byte cap that "obviously covers the head" does.

   This one is **web-only**. `unfurlViaTauri` in `apps/web/lib/unfurl-client.ts` reads the whole
   body with the native HTTP plugin, so desktop would have gotten the title had cause 1 not stopped
   the call. Expect the two platforms to disagree on any large page.

**Which hosts routing alone would fix.** Probed with `curl -A BoardlyBot/1.0` and the byte offset of
the first `og:title`/`<title>`: vimeo, spotify, twitch, instagram, linkedin, facebook, gitlab,
dockerhub, pinterest, stripe, miro, asana, airtable, dropbox, telegram and discord all return a
usable title well inside the cap. youtube/youtu.be need the cap raised (or oEmbed). **tiktok.com
returns a 1.4 KB stub and behance.net a 403 to the bot UA — no metadata at any cap**, so those need
oEmbed or a browser-like `user-agent`, not a bigger buffer.

**Adjacent gap, same area.** `link_metadata_cache` is written only by the web route. The desktop path
parses locally and never reads or populates it, so desktop re-fetches on every add while web honours
the 7-day `CACHE_TTL_MS`.

**Inspecting production links to confirm a report like this.** Card links live inside the Yjs docs in
`yjs_documents`, not in a queryable table, so answering "which of _my_ links are affected" means
decoding them. Two traps: `encode(state,'base64')` in Postgres **wraps at 76 columns**, which silently
shreds a line-oriented CSV reader (it reported 2758 rows for 134 docs) — strip with
`replace(encode(state,'base64'), E'\n', '')` or use `'hex'`; and a script in a scratch dir outside the
workspace cannot resolve `yjs`, so import it by absolute path
(`node_modules/.pnpm/yjs@<ver>/node_modules/yjs/dist/yjs.mjs`). Also worth knowing: the dev database
(`boardly-dev-db`, port 5433) holds only e2e/seed fixtures — `example.com` links and a `boardly/app`
demo board — so a question about real user data can only be answered against the production stack.

**Confirmed against the production data (116 stored links, 2026-11-03).** 35 links show a fixed brand
word (25 LinkedIn, 7 YouTube, 2 Facebook, 1 claude.ai), 33 generic links did get a real title, 12 are
GitHub path labels by design, 10 generic links fell back to a bare host, and the rest sit on a derived
label. Two things the data settled that reading the code did not:

- `link_metadata_cache` in production is **empty (0 rows)** even though 33 links carry fetched titles.
  Only the web route writes that table, so this proves the links were all added from the desktop app —
  and therefore the 512 KB cap has never been the operative cause here. On desktop, cause 1 alone
  accounts for all 35. The corollary is that the cap is a latent bug that only bites once the same
  board is used from the browser.
- **A title is fetched exactly once, at paste time, and never retried.** `updateLinkTitle` has a
  single call site (`use-board.ts`, inside `add`); there is no backfill and no re-unfurl on render.
  So a transient failure is permanent, which is most of the 10 bare-host links: wellfound.com 403s
  the bot UA, dittowords 404s, binance returns `202` with an empty `<title>` (a bot interstitial, and
  `res.ok` is true for 202 so it is treated as a successful empty page), and one entry is four URLs
  pasted as a single space-separated string, which `new URL()` happily accepts and then 404s on. A
  re-unfurl affordance matters as much as fixing the gating.

**Fetching the title each affected link _should_ show turned up two more problems** — do not route the
static providers through unfurl without handling these, or the fix trades a brand word for garbage.

- **Numeric HTML entities are never decoded.** Both `decodeEntities` implementations —
  `apps/server/src/routes/unfurl.ts` and `apps/web/lib/unfurl-client.ts` — allowlist exactly
  `&amp; &lt; &gt; &quot; &#39; &#x27;`. Every other numeric/hex reference passes through raw, so a
  Vietnamese Facebook title renders literally as
  `CH&#x1ee2; GAMING GEAR 2ND: PH&#xcd;M C&#x1a0;, CHU&#x1ed8;T…`. Any non-ASCII `og:title` is
  affected; the fix is a general `&#\d+;` / `&#x[0-9a-f]+;` → `String.fromCodePoint` pass, not six
  more map entries.
- **A fetched title is not automatically better than the short label.** Real results from the probe:
  claude.ai returns Cloudflare's `"Just a moment..."`, wellfound returns `"Security Check | Wellfound"`,
  a dead careers page returns `"Not Found"`, one LinkedIn job page returns the bare string
  `"LinkedIn"`, and a LinkedIn feed permalink returns `"| Vishwas Gopinath"` (empty before the
  separator). Unfurl needs a plausibility guard — drop a title that equals the provider's own
  short label, matches a known interstitial ("Just a moment", "Security Check", "Attention Required"),
  or looks like an error page — and fall back to `shortLabel` rather than storing it.

Of the 44 affected links, 30 yield a good title under the current `BoardlyBot/1.0` UA, 7 (all LinkedIn
job pages) only yield one under a browser-like UA, and 7 are unrecoverable (hard-blocked LinkedIn
profiles, binance's `202` interstitial, and one `.mp4` that is simply not an HTML page).
