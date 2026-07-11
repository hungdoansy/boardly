# UNIT-6.4 — Card-face link cluster (first 5 icons + `+N`)

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 4).

## What changed

The card face no longer lists every link as a labeled chip. It now shows the first 5 links as a compact row of **overlapping provider icons**, with a **`+N` overflow chip** when a card has more than 5.

- **Created `apps/web/components/card/link-cluster.tsx`** — `LinkCluster({ links })`:
  - Renders nothing for an empty list.
  - Shows up to `MAX_VISIBLE = 5` `ProviderIcon`s in `link.ord` order, each in an 18px circular container (`bg-overlay`, `ring-1 ring-elevated`) overlapping the previous by `-ml-1.5`. Earlier icons get a higher `z-index` so the stack reads left-to-right.
  - When `links.length > 5`, appends a `+{links.length - 5}` chip (same pill styling).
  - Labels the group `aria-label="N link(s)"`; each icon carries a `title` (link title or `shortLabelFor(url)`).
- **`apps/web/components/card/badge-row.tsx`** — the `links` badge branch now renders a single `<LinkCluster links={card.links} />` instead of one chip per link. Removed the now-unused `ProviderIcon` and `shortLabelFor` imports.

## Why

- Product decision (user, R7): cards with many links were noisy; Linear-style overlapping icons keep the card dense and calm (DESIGN.md pillars). The full, labeled, reorderable list stays in the card drawer.
- Kept it **config-gated**: the cluster only appears when `links` is in the board's badge config (unchanged behavior), and in whatever position the config places it.
- The stacked-avatars pattern (ring in the card background color) is a standard way to read overlapping marks as one group; `ring-elevated` matches the card's `bg-elevated` for the cut-out effect.

## How it works

`BadgeRow` iterates the board's `badgeConfig`; for the `links` key (when the card has links) it emits `<LinkCluster>`. The cluster slices the first 5 (already `ord`-sorted upstream in `cardToPlain`) and computes `overflow = links.length - 5`.

## How to test / verify

- **Component tests** (`apps/web/components/card/link-cluster.test.tsx`, green):
  - 0 links → renders nothing.
  - 3 links → 3 icons, no `+`.
  - 5 links → 5 icons, no `+`.
  - 6 links → 5 icons + `+1`; 26 links → 5 icons + `+21`.
  - first 5 icons rendered (order/count), and `aria-label` reports the total (`"8 links"`, `"1 link"`).
- `badge-row.test.tsx` still green (links branch now delegates to the cluster).
- Typecheck + lint + full web suite (152 tests) + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

### Browser verification note

A live dark-mode screenshot could not be captured this iteration: the browser-pane Next dev server repeatedly crashed (blank pages) and board mutations (add column/card) would not persist in the churned session, and the single-board `select` no-op (UNIT-6.3) prevents navigating to the seed demo board that already has a link-rich card. The visual behavior is instead fully pinned by the component tests above (exact icon counts and overflow text), and UNIT-6.2's screenshots confirm the card face renders with the design tokens. A screenshot should be captured opportunistically in a later unit once the dev server is stable and a link-rich card is reachable.

## Follow-ups / known gaps

- The `+N` chip is not yet interactive (no click-to-expand); clicking a card still opens the drawer with the full list. A dedicated overflow popover could be added later if desired.
- Icons use a `bg-overlay` container with a `ring-elevated` separator; on card hover the face becomes `bg-hover`, so the ring is a hair off the exact hover background. Acceptable at this size; revisit if it reads poorly on hover.
