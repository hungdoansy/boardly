# UNIT 11.2: Link-row action icons reveal on hover/focus only

- **Plan unit:** Unit 2 (`docs/plans/2026-07-14-002-feat-ui-docs-improvements-batch-plan.md`)
- **Status:** done
- **Requirements:** R2
- **Commit(s):** _this commit_

## What changed

- `apps/web/components/card/links.tsx` — the two per-row indicator icons that were always visible now reveal only on row hover or keyboard focus:
  - the inline `Copy` icon on a Claude-Code session chip (the copy affordance), and
  - the `ArrowUpRight` deep-link indicator on external link anchors.
  Each gained `opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-within:opacity-100`.
- `apps/web/components/card/links.test.tsx` — two tests asserting the copy and arrow icons carry the hidden-until-hover reveal classes, and that the link's label (identity) is never hover-gated.

## Why (decisions)

- The link list already hid its move/reorder/remove controls until hover (the trailing action group used `opacity-0 … group-hover:opacity-100 focus-within:opacity-100`), but the inline `Copy` and `ArrowUpRight` icons stayed on, so the list read busier than the rest of the app at rest. The request was to make those icons hover-only too, "like the copy button and others".
- **Reuse the existing idiom, add nothing new.** The same `group` + `opacity-0 group-hover:opacity-100` reveal is used across `checklist.tsx`, `related.tsx`, `label-manager.tsx`, and `project-settings.tsx`. This unit extends it to the two remaining always-on icons — zero new patterns or tokens.
- **`group-focus-within` (not `focus-within`).** These icons live *inside* the focusable `<button>`/`<a>`, not in a wrapper, so the reveal is driven off the row's `group` when any descendant is focused — keeping the icons reachable for keyboard users (a11y parity with the mouse reveal).
- **Provider/identity icon is deliberately left visible.** Only action/indicator icons hide; the leading provider glyph and the label are the link's identity and must stay legible at rest. (Verified by the test asserting the label is always present.)

## How it works

- Each row `<li>` is already `class="group …"`. At rest the two icons are `opacity-0`; on `:hover` of the row (`group-hover`) or when the row's link/button receives focus (`group-focus-within`) they fade to `opacity-100` over `--dur-fast` (120ms). Opacity is compositor-friendly and honored by the global `prefers-reduced-motion` handling, per `DESIGN.md` §6.

## Design (UI units)

- Tokens: `--dur-fast` (120ms) for the fade; no color/spacing changes. Matches `DESIGN.md` §6 (hover = `--dur-fast`, opacity transitions) and §7.1 (icons remain lucide SVGs).
- Dark-mode: at rest the row shows provider icon + label only; on hover the copy/open indicator fades in alongside the existing move/remove controls. Consistent with the already-shipped move/remove reveal (UNIT-2.7/3.7 link work). Recommended manual check: open a card with a Claude-session link and an external link in dark mode and hover a row.

## How to test / verify

- Unit tests (`apps/web/components/card/links.test.tsx`): "keeps the claude-session copy indicator hidden until row hover/focus" and "keeps the deep-link open indicator hidden until row hover/focus" assert the reveal classes on the `.lucide-copy` / `.lucide-arrow-up-right` svgs; the label remains in the document. Run: `pnpm exec vitest run apps/web/components/card/links.test.tsx` (11 passing).
- `pnpm --filter @boardly/web typecheck` clean; eslint/prettier clean on the touched files.
- Manual: hover a link row → copy/open icon fades in; move/remove already behave this way; identity stays visible at rest.

## Follow-ups / known gaps

- None. (A dedicated automated hover screenshot isn't added — the state is proven by the class-based test and mirrors an already-shipped pattern.)
