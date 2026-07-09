# UNIT 2.7: Smart link chips + extensible provider registry + unfurl

- **Plan unit:** 2.7 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R7
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.7-links-dark.png`

## What changed

Attach URLs to a card; render provider-aware chips (icon + shortened label) via an extensible
registry; groundwork for generic-link unfurl.

- `packages/domain/src/links/` — **provider registry**. `registry.ts` (`LinkProviderDef`,
  ordered `PROVIDERS`, `detectProvider`, `shortLabelFor`, `normalizeUrl`) + one file per provider
  in `providers/`: `slack`, `linear`, `github-pr`, `github-issue`, `claude`, `generic` (last).
  Replaces the flat `links.ts` from Unit 0.3; `LinkProvider` gains `github`. Adding a provider = one
  file + one array entry.
- `packages/sync/src/board-doc.ts` — `addLink` now **de-duplicates by `normalizeUrl`** (adding an
  existing link returns its id).
- `apps/web/components/card/provider-icon.tsx` — bundled provider marks (monogram chips for
  slack/linear/github/claude; globe for generic) — no network fetch.
- `apps/web/components/card/links.tsx` — `CardLinks`: chip list (provider icon + short label,
  opens in a new tab, hover-remove) + a paste-URL add field.
- `apps/web/lib/unfurl-client.ts` — `unfurl(url)` → `/api/unfurl` (server lands in 3.7); any failure
  returns null so the chip falls back to the hostname.
- `packages/domain/src/badges.ts` — `links` added to `BADGE_FIELDS` + `DEFAULT_BADGE_CONFIG`;
  `BadgeRow` renders link chips on the card face.
- Wiring: a **Links** section in the card detail; `useLinkActions` (add/remove via the command layer,
  auto provider detection).
- Tests: `packages/domain/src/links/registry.test.ts`, `apps/web/components/card/links.test.tsx`.

## Why (decisions)

- **One registry is the single source of truth** for both the card chips and the command layer
  (`detectProvider` in `addLink`). Providers are pure `{ id, match(url), shortLabel(url) }` — no
  React/SVG in domain; the UI maps a provider id to a bundled icon.
- **Two GitHub providers (pr + issue)** matched by path (`/pull/` vs `/issues/`), both id `github`,
  both label `owner/repo#123` — disambiguated by path, same visual result. `generic` matches
  everything and is registered **last** so it never shadows a specific provider (a bare
  `github.com/o/r` correctly falls to generic).
- **De-dup by `normalizeUrl`** (lowercase origin, no trailing slash, no hash) so pasting the same
  link twice is a no-op.
- **Bundled monogram icons** (not fetched, not a brand-icon dependency) — reliable, brand-colored,
  and dependency-free; the generic globe covers everything else.
- **Unfurl is a graceful seam** — `unfurl-client` is wired for the Phase-3 `/api/unfurl`; until then
  (static export, no server) it returns null and chips show the hostname (the plan's fallback edge
  case). Known providers never unfurl.

## Design (per DESIGN.md)

- Chips: `--radius-sm`, `text-xs`, provider monogram/globe + short label; detail rows open in a new
  tab with hover-remove; card-face link chips sit in the configured badge row. All tokens.
- Dark screenshot: `docs/units/screenshots/UNIT-2.7-links-dark.png` (Linear + GitHub PR + generic
  chips in the detail and on the card face).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/domain test` — registry: every provider detected + labeled; GitHub PR vs
  issue by path; generic doesn't shadow a bare github URL; malformed → generic; `normalizeUrl`
  de-dup canonicalization.
- `pnpm --filter @boardly/web test` (55) — add a link → provider chip; **de-dup** by normalized URL;
  unfurled **title** shown when present; remove.
- Full gates: typecheck 7/7, lint 7/7, test (domain 22 / sync 17 / commands 8 / ui 2 / web 55),
  `pnpm --filter @boardly/web build` valid, `format:check` clean. Playwright: add Linear + GitHub PR
  - generic links → correct chips; dark screenshot vs DESIGN.md.

## Follow-ups / known gaps

- **`/api/unfurl`** (title/favicon for generic links) is Unit 3.7; the desktop native CORS-free fetch
  is Unit 5.2. `unfurl-client` is ready for both.
- Provider icons are monograms; real brand SVGs could be swapped in behind `ProviderIcon` without
  touching the registry.
- Generic favicons are not shown yet (need the unfurl endpoint); the globe stands in.
