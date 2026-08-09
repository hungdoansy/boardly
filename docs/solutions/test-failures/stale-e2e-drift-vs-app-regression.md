---
title: Telling stale e2e tests from real app regressions
date: 2026-08-05
problem_type: test-failures
module: apps/e2e
severity: medium
tags: [playwright, e2e, visual-regression, screenshot-baseline, locators, aria, test-drift]
---

Nothing in CI runs `apps/e2e` (UNIT-5.4 left it explicitly out of `pnpm -r test` — it needs
browsers + a live server/db). It therefore rots quietly against every later unit. On 2026-08-05,
14 of 23 specs failed on `main`; **every single failure was a stale test, not an app regression.**
The triage below is the reusable part.

## A small `maxDiffPixelRatio` is not evidence of a small change

`focus-calm-dark` and `list-grouped-dark` both failed at **ratio 0.01**. That number invites
`--update-snapshots` on reflex, or a shrug that it's antialiasing. Opening the diff images told a
very different story:

- `focus-calm-dark` still showed the **pre-UNIT-9 user-managed columns** — "To Do" / "Doing" /
  "Done" plus an "Add column" button. An entire board model that no longer exists.
- `list-grouped-dark` still showed the legacy `BRD-2` short id. An unset `shortIdPrefix` now
  renders `#2` via `formatTicketId` ([`packages/domain/src/ids.ts`](../../../packages/domain/src/ids.ts));
  `formatShortId` is marked legacy in that same file.

Both read as ~1% **because the captured region is mostly empty dark background**. The ratio measures
how much of the _canvas_ changed, not how much of the _content_ changed. On a sparse screen a total
UI replacement and a font-hinting wobble produce the same number, so the ratio cannot distinguish
them in either direction. Always open the `-diff.png` before deciding — that is the only step that
separates "re-record the baseline" from "you broke the app".

Corollary: `board.spec.ts`'s `board-dark` sets `maxDiffPixelRatio: 0.03` and so **passed throughout**,
silently absorbing the same drift. A tolerance generous enough to hide antialiasing is generous
enough to hide a rewritten board.

## Role-based locators fail to _zero_, and it looks like an app hang

UNIT-9.7 made the whole card face clickable and deleted the inner title button — the face is now
`<article aria-label="Card: …">` ([`apps/web/components/card/card.tsx`](../../../apps/web/components/card/card.tsx)).
The helper still did `getByRole("button", { name: title, exact: true }).click()`, which matches
nothing, so Playwright waits the full 30s and reports a `locator.click` timeout. That reads exactly
like a hung app or a broken feature; the actual cause is a role that changed out from under the
locator. Before debugging the app, check the element still has the role the test assumes.

The mirror-image failure: a locator that starts matching **two** elements. UNIT-13 gave the column
header a `+` carrying the same `aria-label="Add card"` as the footer composer button, so
`column.getByRole("button", { name: "Add card", exact: true })` became a strict-mode violation.
`exact: true` guards against a _longer_ name, not against a duplicate — scope to a container
(`column.locator("header")`) instead.

Both shapes share a root cause worth internalising: **an accessible name is a shared namespace
across the whole subtree.** Adding an affordance with an existing `aria-label`, or changing an
element's role, silently rewrites what every existing locator resolves to.

## Seeding leaves hover state in later screenshots

`addCard` clicks the column header `+`, and Playwright leaves the cursor there. The header's
`hover:bg-hover` then baked into every visual baseline captured after seeding. `addCard` now ends
with `page.mouse.move(0, 0)`. Worth checking whenever a baseline shows an inexplicable highlight —
and worth distinguishing from genuinely state-gated UI: the column's `…` menu in those same
screenshots is card-count-gated, not hover-gated, so it belongs in the baseline.

## Gotcha: the fix may already exist on an unmerged branch

The `addCard` strict-mode fix was already written in PR #7, which was still **open**. Main really
did still have the bug. Applying PR #7's fix verbatim — same scoping, same comment — kept the merge
conflict-free. Check open PRs before inventing a different fix for the same symptom.
