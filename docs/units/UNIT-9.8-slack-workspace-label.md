# UNIT-9.8 — Slack links show the workspace name (no deep-link arrow)

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 10).

## What changed

Slack links now display the **workspace name** (from the subdomain) instead of a generic `msg`,
and drop the deep-link `→` arrow.

- **`packages/domain/src/links/providers/slack.ts`**: `shortLabel` derives the workspace from the
  host — `<workspace>.slack.com` → title-cased workspace (`acme.slack.com` → `Acme`). The
  enterprise host (`slack.com`) and the `app`/`www` subdomains carry no workspace name → the
  generic `Slack`. It no longer appends the `" →"` deep-link marker.

## Why

- Slack messages can't be unfurled (no fetched title), so the old `msg →` gave no useful context.
  The workspace name is the meaningful, always-derivable label — exactly the "show the workspace
  name instead" ask.
- Dropping the `" →"` marker means `stripDeepLinkMarker` reports `isDeepLink: false` for Slack, so
  the Links section renders **no `ArrowUpRight`** for Slack links — the "remove the external link
  icon" ask. The marker mechanism itself is untouched, so other deep links (e.g. Claude's
  `session →`) keep their arrow.

## How it works

`linkLabel` already falls back to `shortLabel` for providers without a fetched title (Slack has
none), so the new workspace label flows straight to both the drawer list and the card-face cluster
tooltip. Because the label no longer ends in `" →"`, every renderer that calls
`stripDeepLinkMarker` (drawer `links.tsx`, `link-cluster.tsx`) drops the arrow for Slack with no
per-renderer change.

## How to test / verify

- **Unit tests (all green):**
  - `packages/domain/src/links/registry.test.ts`: `acme.slack.com/archives/…` → `Acme`;
    `app.slack.com/client/…` and bare `slack.com/…` → `Slack`; and a regression that
    `stripDeepLinkMarker(shortLabelFor(slackUrl)).isDeepLink === false` while Claude's
    `session →` still flags `isDeepLink: true`.
  - `apps/web/components/card/link-cluster.test.tsx`: the marker-stripping test now uses a Claude
    link (still a deep link) since Slack no longer carries the marker.
- **DoD run (Node 22.17.1):** typecheck clean (all except the pre-existing `@boardly/e2e` DOM-lib
  break, unrelated); lint clean (exit 0); `vitest run` = 437 passed / 37 skipped; `@boardly/web`
  build compiles.

## Follow-ups / known gaps

- **Dark-mode screenshot pending:** no web dev server this session, so the visual (a Slack link
  reading e.g. "Acme" with no arrow) wasn't captured. The change is a label string + removal of an
  icon via the existing marker mechanism (covered by tests); capture opportunistically when the
  dev stack is up.
- Scoped to Slack per the request ("and maybe other brands"). Other providers' deep-link arrows
  (e.g. Claude `session →`) are intentionally unchanged; revisit if the Slack change reads well.
