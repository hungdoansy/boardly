# UNIT-P7 — Card detail drawer section reorder

Requested interactively: reorder the card detail drawer's sections to
Description → Properties → Links → Checklist → Labels → Activity (previously
Description → Checklist → Labels → Links → Properties → Activity).

## What changed

- **`apps/web/components/card/card-detail.tsx`** — reordered the `<section>` blocks inside
  `CardDetailBody`'s scroll area. No section's contents, props, or the components they
  render (`MarkdownEditor`, `PropertyList`, `CardLinks`, `Checklist`, `CardLabels`,
  `CardActivity`) changed — this is a pure JSX reorder.

## Why

Purely a requested information-hierarchy change: properties (status/priority/due/project)
now surface immediately after the description, ahead of the more incidental
links/checklist/labels detail, with activity staying last as a log.

## How it works

N/A — no behavior change, just render order.

## How to test/verify

- `pnpm --filter web exec tsc --noEmit` — clean.
- `pnpm --filter @boardly/web exec vitest run` — 180/180 passed (no test asserted the old
  order).
- Manual, dark mode, demo board: opened BRD-3, confirmed the drawer now reads Description,
  Properties, Links, Checklist, Labels, Activity top to bottom.

## Follow-ups / known gaps

None.
