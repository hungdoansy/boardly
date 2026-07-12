# UNIT 1: Strip the remaining Unicode glyphs — SVG at the render boundary

- **Plan unit:** 1 (`docs/plans/2026-07-12-003-fix-card-polish-severity-removal-plan.md`)
- **Status:** done
- **Requirements:** R1
- **Commit(s):** `9fa8911` (landed together with the plan doc)

## What changed

- `packages/domain/src/links/registry.ts` — added `stripDeepLinkMarker(label)`,
  a small pure helper next to `shortLabelFor` that strips the trailing `" →"`
  marker some provider `shortLabel`s append (Slack `"msg →"`, Claude
  `"session →"`) and reports whether the label was a deep link.
- `apps/web/components/card/links.tsx` (card-drawer link list) — now calls
  the shared helper instead of its own inline `.endsWith(" →")` check.
- `apps/web/components/card/link-cluster.tsx` (card-face link icon cluster)
  — its `title` attribute (a native browser tooltip, plain text only) now uses
  the stripped label. Previously it put the raw provider label straight into
  `title`, so hovering a deep-link icon on the card face showed the literal
  `→` glyph.
- `apps/web/components/board/filter-builder.tsx` — the selected-option
  checkmark in the value multi-select list was a bare `✓` text node (inside
  an `aria-hidden` span, but still visible to sighted users); replaced with
  lucide's `Check` icon (`size-3.5`).
- Tests: `packages/domain/src/links/registry.test.ts` (new `describe("stripDeepLinkMarker")`),
  `apps/web/components/card/link-cluster.test.tsx` (new deep-link-title test),
  `apps/web/components/board/filter-builder.test.tsx` (new SVG-check assertion).

## Why (decisions)

- **One shared helper, not two inline checks.** `links.tsx` already stripped
  the marker correctly; `link-cluster.tsx` didn't, which is exactly how the
  two surfaces drifted out of sync in the first place. Extracting the logic
  into `packages/domain` (next to the string that produces the marker) means
  both call sites can't diverge again.
- **`title` stays plain text.** A native HTML `title` attribute can't render
  an SVG, so the card-face tooltip just shows the clean label; the
  `ArrowUpRight` deep-link affordance is already visible as an icon in the
  full drawer list (`links.tsx`), so nothing is lost.
- This is exactly the case `docs/design/DESIGN.md` §7.1 already calls out:
  *"If a data string carries a glyph marker ... strip it at the render
  boundary and draw the SVG — don't print the glyph."*

## How it works

`shortLabelFor(url)` (unchanged) returns a provider's short label, which for
deep-link providers ends in the literal string `" →"`. `stripDeepLinkMarker`
checks for that suffix and returns `{ label, isDeepLink }` — `label` has the
suffix removed either way (a no-op slice if there's no marker). Both
`links.tsx` and `link-cluster.tsx` destructure this once, right after calling
`shortLabelFor`, and use `label` everywhere they'd previously used the raw
string.

## How to test / verify

- `packages/domain/src/links/registry.test.ts` — asserts the marker is
  stripped and `isDeepLink` is set correctly for both marked and unmarked
  labels.
- `apps/web/components/card/link-cluster.test.tsx` — renders a Slack deep
  link and asserts the icon's `title` attribute is `"msg"` with no `→`.
- `apps/web/components/board/filter-builder.test.tsx` — opens the Priority
  value editor and asserts the selected option's DOM contains an `<svg>`
  (lucide `Check`) and its `textContent` doesn't match `/✓/`.
- Manual: in the demo board, hover a deep-link icon on a card face (the
  "Everything ticket" seed card has Slack/Claude links) — the tooltip reads
  e.g. `"msg"`, not `"msg →"`.

## Follow-ups / known gaps

- None. A repo-wide grep for the banned glyph set (`docs/design/DESIGN.md`
  §7.1) across rendered UI turned up nothing else after this unit.
