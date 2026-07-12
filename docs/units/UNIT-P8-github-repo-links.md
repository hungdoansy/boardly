# UNIT-P8 — GitHub repo link recognition + description

Requested interactively: pasting a bare GitHub repo link (`https://github.com/owner/repo`)
previously fell through to the generic link handler — no GitHub icon, and the label was just
"github.com" (or a server-fetched page `<title>`). Only `/pull/` and `/issues/` URLs got
GitHub-specific treatment (`owner/repo#123`).

## What changed

- **`packages/domain/src/links/providers/github-repo.ts` (new)** — a `LinkProviderDef` for
  bare `github.com/owner/repo` URLs. `shortLabel` → `owner/repo`. A small owner-name denylist
  (`settings`, `orgs`, `marketplace`, …) keeps GitHub's own two-segment top-level pages from
  misreading as a repo. Also exports `isGithubRepoUrl(url)`, a synchronous predicate reused by
  the web layer to gate the async description fetch below.
- **`packages/domain/src/links/registry.ts`** — registers `githubRepo` in `PROVIDERS` (after
  `githubPr`/`githubIssue`, before `generic`, so PR/issue URLs keep matching first). Adds two
  new exports:
  - `linkLabel(link)` — the label to render. For every provider except GitHub: `title ??
    shortLabel`. For GitHub: always `shortLabel` (the repo/PR/issue path) — a link's `title`
    is never allowed to replace that path.
  - `linkSubtitle(link)` — secondary descriptive text, currently only `title` when
    `provider === GitHub` (i.e. a fetched repo description).
- **`apps/web/lib/unfurl-client.ts`** — `fetchGithubRepoDescription(url)`: best-effort fetch
  of a repo's `description` from GitHub's public REST API (`api.github.com/repos/{owner}/
  {repo}`, CORS-enabled, no auth needed for public repos). Returns `undefined` on anything
  that isn't a bare repo URL, a private/missing repo, or a network failure — never blocks
  adding the link.
- **`apps/web/lib/use-board.ts`** (`useLinkActions().add`) — for a GitHub-repo URL
  (`isGithubRepoUrl` true), awaits `fetchGithubRepoDescription` and stores the result in the
  link's existing `title` field (same field generic links use for their unfurled title — no
  schema change). PR/issue GitHub links are unaffected (the check is skipped entirely, so the
  `add` handler stays fully synchronous for them, same as before).
- **`apps/web/components/card/links.tsx`** (drawer's full Links list) — renders
  `linkLabel(link)` as before, plus a new muted `linkSubtitle(link)` span inline after it when
  present (repo descriptions only, for now).
- **`apps/web/components/card/link-cluster.tsx`** (card-face compact icon cluster) — its
  hover tooltip now uses `linkLabel` too, for consistency; unchanged otherwise (no visible
  label on the card face, by design — see `UNIT-P3`).

## Why

- **Icon + repo path, guaranteed and synchronous** was the core ask; matching the existing
  `LinkProviderDef` pattern (same shape as `githubPr`/`gitlabMr`/etc.) needed no new
  abstraction and no icon work (`provider-icon.tsx`'s `BRAND.github` entry already covers any
  link with `provider: LinkProvider.GitHub`).
- **Reused the existing `title` field instead of adding a `subtitle`/`description` field to
  `CardLink`** — a new field would mean touching the sync schema/Yjs doc shape for one
  provider's nice-to-have. `title` was already unused for non-generic links, so repurposing it
  (with `linkLabel`/`linkSubtitle` as the single place that decides how to read it back) kept
  this to a domain + two-file web change, no schema migration.
- **GitHub's public REST API over the existing HTML-scraping `/api/unfurl` endpoint** — a repo
  page's `<title>`/`og:title` renders as a clunky "GitHub - owner/repo: description" string;
  the API gives a clean `description` field directly, and (being a fixed, trusted host) needs
  none of `/api/unfurl`'s SSRF guarding — a direct client-side `fetch` is simplest.
- **Synchronous gate (`isGithubRepoUrl`) before the async fetch** — keeps `add()` fully
  synchronous for the common PR/issue-link case (matching prior behavior and the existing
  `links.test.tsx` assertion), only paying an `await` when there's an actual description to
  fetch.
- **`linkLabel` always wins over `title` for GitHub** — without this, a fetched description
  would silently replace the `owner/repo` (or `owner/repo#123`) path as the primary label,
  which is the opposite of what was asked for (both, not one replacing the other).

## How it works

`detectProvider` now resolves a bare `github.com/owner/repo` URL to `LinkProvider.GitHub` via
the new `githubRepo` matcher. On add, `use-board.ts` checks `isGithubRepoUrl` (pure regex, no
network) before awaiting `fetchGithubRepoDescription`, which hits `api.github.com` directly
and returns the repo's `description` (or `undefined`). That value is stored as the link's
`title` — no different, structurally, from how a generic link's unfurled title is stored.
Rendering never reads `title` as the label for a GitHub link; `linkLabel`/`linkSubtitle` are
the single place that split "path" from "description" for every renderer.

## How to test/verify

- **Unit** — `packages/domain/src/links/registry.test.ts`: `detectProvider` now resolves a
  bare repo URL to `GitHub` (and still resolves GitHub's own `settings`/`orgs` pages to
  `Generic`); `shortLabelFor` asserts `owner/repo`; a new `linkLabel`/`linkSubtitle` describe
  block asserts GitHub always shows the path (never the title) and moves a present title to
  the subtitle, while every other provider keeps the old title-wins behavior.
- **Suite** — `pnpm --filter @boardly/domain exec vitest run` → 102/102 (was 97); `pnpm
  --filter @boardly/web exec vitest run` → 180/180 unchanged (the existing `links.test.tsx`
  PR-link assertion still passes synchronously, confirming the sync gate works); `tsc
  --noEmit` clean on both packages.
- **Manual (dark mode)**, demo account: opened BRD-3, pasted `https://github.com/facebook/
  react` into the drawer's Links field — it rendered the GitHub icon, "facebook/react", and (a
  moment later, once the API call resolved) "The library for web and native user interfaces."
  in faint text after it, truncating together on overflow. Removed it afterward to leave the
  seed data unchanged.

## Follow-ups / known gaps

- No caching for the description fetch (each `add` hits `api.github.com` once; unauthenticated
  rate limit is 60 req/hr per IP, ample for interactive use — not revisited for now, per "don't
  go too deep").
- The card-face `LinkCluster` still shows icon-only (no repo path visible without opening the
  drawer) — consistent with its existing compact design (`UNIT-P3`), not changed here.
- The owner-name denylist in `github-repo.ts` is a short, hand-picked list, not exhaustive —
  an obscure two-segment GitHub top-level path not on the list would still misread as a repo.
