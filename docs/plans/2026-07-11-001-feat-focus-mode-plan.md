---
title: "feat: Focus mode — cycle Off → Calm → Zen to quiet the board"
type: feat
status: active
date: 2026-07-11
---

# feat: Focus mode — cycle Off → Calm → Zen to quiet the board

## Overview

An appearance-only "Focus mode" that reduces the board's visual noise so the user can
concentrate. It is a **preference**, not a data lens: it changes how loud cards *look*, never
which cards show. Three states cycle with one keyboard shortcut (`Shift+F`) and a toolbar
indicator:

- **Off** — normal (all badges, full color).
- **Calm** — all badges kept, but color **muted** (desaturated, _not_ grayscale) so an
  overdue/urgent card is still faintly perceptible.
- **Zen** — card face + list row collapse to **title + a single muted status marker**; every other
  badge (priority, severity, due, labels, links, checklist) is hidden.

It must read well in **both dark and light themes** (dark verified first, per repo rules). The card
detail drawer and any portaled popovers stay full-color — they portal out of the filtered
container, which is desirable: a quiet board, full context on the one card you open.

## Problem Frame

The card face is information-dense — status, priority, severity, due, labels, links, checklist
badges, each color-coded (see `docs/design/DESIGN.md` §2 Encodings). That density is great for
triage but "takes too much attention" when the user wants to focus. There's no way today to dial it
down short of manually editing the per-board badge config (the Badges menu), which is persistent,
shared, and clumsy. Focus mode gives a one-keypress, reversible, personal volume knob.

(Origin: this conversation. Design exploration settled on a 3-state ladder — Off/Calm/Zen — with
"muted, not grayscale" for Calm, and "reuse the badge-visibility concept" for Zen.)

## Requirements Trace

- **R1** — One control cycles Off → Calm → Zen → Off; both a `Shift+F` shortcut and a toolbar
  indicator button; instant and reversible.
- **R2** — Calm mutes color (desaturate ≈ 0.4, tuned per theme) — never full grayscale; the
  overdue/urgent signal must remain faintly perceptible; all badges stay visible.
- **R3** — Zen collapses the board card face and the list row to title + a single muted status
  marker; priority/severity/due/labels/links/checklist are hidden.
- **R4** — Appearance preference persisted per-device (localStorage), applied pre-paint (no flash);
  **no** Yjs/data mutation; independent of saved-view lenses.
- **R5** — Applies to both the board and the list view; the detail drawer and portaled popovers
  stay full-color.
- **R6** — Correct and legible in **both** dark and light themes (verified in both; dark first).
- **R7** — Respect `prefers-reduced-motion`; follow repo rules — shadcn/ui + design tokens, exact
  dep versions (no new deps expected), SVG icons only (no glyphs, `DESIGN.md` §7.1), and a committed
  `docs/units/` doc per unit.

## Scope Boundaries

- **Not** a saved-view property (`SavedView.filter/sort/groupBy/layout` unchanged). Focus is an
  appearance preference, not a lens.
- **No** change to what cards are shown, their order, or any card data — purely presentational.
- **No** per-badge granular controls, no slider, no 4th level. The "Quiet / single-signal" middle
  level explored in discussion is intentionally **dropped** (decision below).
- Sidebar and header chrome are **not** muted — only the board/list content region.
- Light-theme *fine-tuning* beyond "legible and clearly quieter" is acceptable to iterate later;
  the unit must still ship a working, verified light appearance (R6), not defer it.

## Context & Research

### Relevant Code and Patterns

- **Preference store to mirror:** `apps/web/lib/theme.ts` — a module-level store exposed via
  `useSyncExternalStore`, persisted to `localStorage` (`boardly-theme`), stamping a class on
  `<html>` via `applyTheme()`. Focus mode copies this shape almost exactly.
- **No-FOUC pre-paint script:** `apps/web/app/layout.tsx` (`THEME_INIT`) stamps `.dark`/`.light`
  before first paint. Focus mode adds an equivalent stamp of `data-focus`.
- **Toolbar toggle pattern:** `apps/web/components/app/theme-toggle.tsx` (`useTheme().toggle`) — the
  focus indicator button mirrors it (`useFocusMode().cycle`).
- **Keyboard-shortcut host:** `apps/web/components/app/workspace-app.tsx` `Shell` has a `keydown`
  listener (currently `/` → search) with an `isEditableTarget()` guard. `Shift+F` hangs here.
- **Render scope:** `apps/web/components/app/workspace-app.tsx` line ~212 — the single `<main>` that
  wraps both `ListView` and `BoardView`. The Calm filter is scoped to this element (so portaled
  drawer/popovers escape it).
- **Badge visibility (Zen reuse):** `apps/web/components/card/badge-row.tsx` (`BadgeRow` renders the
  ordered `config: string[]`), fed by `useBadgeConfig` / `packages/domain/src/badges.ts`
  (`DEFAULT_BADGE_CONFIG`). Zen = render with an overridden config of just `["status"]`. Board card
  face: `apps/web/components/card/card.tsx` (+ `apps/web/components/board/column-cards.tsx` passes
  `config`); list rows: `apps/web/components/board/list-view.tsx` (`ListRow` renders `BadgeRow` with
  the config minus `"status"` for trailing badges, plus a leading `StatusIcon`).
- **Token pattern for new tokens:** `packages/ui/src/theme.css` — the recently added `--bg-hover`
  (translucent, per-theme) shows the convention: declare the raw value in `:root` (dark) and
  `:root.light`, then map a utility via the `@theme` block. Focus adds `--focus-saturate` the same
  way.
- **Status marker for Zen:** `apps/web/components/card/status-badge.tsx` / `@boardly/ui` `StatusIcon`
  — already an SVG status glyph; reused as the single Zen marker.

### Institutional Learnings

- No `docs/solutions/` entries. Relevant repo memory: verifying UI runs against a dev server on
  `:3000` (`.claude/launch.json`), dark-first screenshot discipline (`DESIGN.md`), and the
  "icons are SVG, never glyphs" rule (`DESIGN.md` §7.1) all apply here.

### External References

- None needed — this is a CSS-`filter` + local-store feature with strong in-repo precedent.

## Key Technical Decisions

- **Muted, not grayscale (R2).** Calm uses `filter: saturate(var(--focus-saturate))`, not
  `grayscale()`. Grayscale destroys the *meaning* of color (overdue-red and done-green collapse to
  the same gray); saturate only lowers the *loudness*, so the one signal worth glancing for
  survives. This was the central design finding.
- **Attribute on `<html>`, filter scoped to the content region.** `applyFocus()` stamps
  `data-focus="calm|zen"` on `document.documentElement` (mirroring the theme class), but the CSS
  `filter` is applied only to the board/list `<main>` via a `data-focus-scope` marker. Because
  Radix `Sheet`/`Popover` and dnd-kit's `DragOverlay` portal to `<body>` (outside `main`), they are
  **unaffected** — satisfying R5 for free.
- **Zen reuses the badge config, doesn't invent hiding.** Zen renders `BadgeRow` with an effective
  config of `["status"]` (board) / trailing config emptied (list), computed once per container from
  `useFocusMode()` — not per card, and not via fragile CSS `:nth-child` hacks. This is the
  "reuse the badge-visibility concept" the design called for, and it's unit-testable.
- **Per-theme saturate via a token.** `--focus-saturate` is declared per theme in `theme.css` so
  the muted look can be tuned independently for dark vs light without touching component code (R6).
- **Preference, persisted per-device (R4).** Copy `lib/theme.ts` exactly: `useSyncExternalStore` +
  `localStorage` (`boardly-focus`) + a pre-paint stamp in `layout.tsx`. No Yjs, no `SavedView`
  change.
- **Drop the middle "Quiet" level.** Three states (Off/Calm/Zen) keep the cycle a reflex; a 4th
  "single-signal" level forces a "which axis survives?" decision that undercuts a focus feature.

## Open Questions

### Resolved During Planning

- *How many levels?* → Off / Calm / Zen (middle level dropped).
- *Global vs per-view?* → Global appearance preference (per-device), not a saved view.
- *Board only or list too?* → **Both** surfaces.
- *Grayscale or muted for Calm?* → Muted (`saturate`), never grayscale.
- *Where does the drawer land?* → Stays full-color (portals out of the filtered `main`).

### Deferred to Implementation

- **Exact `--focus-saturate` values per theme.** Start dark ≈ `0.4`; pick the light value by eye in
  the running app (light surfaces are white, so the same factor may read differently). Tune during
  the screenshot pass.
- **Whether Zen also needs a slightly stronger saturate** than Calm on the surviving status marker —
  decide visually.
- **Exact lucide icon for the indicator** (candidate: `Focus`; alternatives `Eye`/`Sparkles`) and
  whether the button shows a text label per level or icon-only + `aria-label`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation
> specification. The implementing agent should treat it as context, not code to reproduce.*

Level → effect matrix (the two axes move together, monotonically):

| Level | `data-focus` | Color (on `main`)            | Card face / list row badges          | Drawer & popovers |
|-------|--------------|------------------------------|--------------------------------------|-------------------|
| Off   | (absent)     | full                         | full `config`                        | full color        |
| Calm  | `calm`       | `saturate(--focus-saturate)` | full `config`                        | full color        |
| Zen   | `zen`        | `saturate(--focus-saturate)` | `["status"]` only (title + dot)      | full color        |

Data flow (mirrors theme):

    localStorage["boardly-focus"] ──▶ focus-mode store (useSyncExternalStore)
        │                                   │
        │ pre-paint (layout.tsx script)     │ applyFocus() → <html data-focus="…">
        ▼                                   ▼
    <html data-focus>            CSS: :root[data-focus] [data-focus-scope]{filter:saturate(var(--focus-saturate))}
        │                                   │
        └── useFocusMode() in board/list containers ──▶ Zen: pass config=["status"] to BadgeRow

## Implementation Units

- [x] **Unit 1: Focus-mode preference + Calm (mechanism)**

**Goal:** The full toggle/persistence/keyboard/indicator machinery, plus the Calm level (muted
color) working in both themes. After this unit, cycling reaches Off ↔ Calm (Zen is a no-op until
Unit 2).

**Requirements:** R1, R2, R4, R6, R7

**Dependencies:** None

**Unit doc (DoD):** `docs/units/UNIT-F1-focus-mode-core.md`

**Files:**
- Create: `apps/web/lib/focus-mode.ts` (store; mirror of `lib/theme.ts`)
- Create: `apps/web/lib/focus-mode.test.ts`
- Create: `apps/web/components/app/focus-toggle.tsx` (toolbar indicator; mirror of `theme-toggle.tsx`)
- Create: `apps/e2e/tests/focus-mode.spec.ts` (Calm e2e + dark & light baselines)
- Create: `docs/units/UNIT-F1-focus-mode-core.md`
- Modify: `apps/web/app/layout.tsx` (add a no-FOUC `data-focus` stamp alongside `THEME_INIT`)
- Modify: `packages/ui/src/theme.css` (add `--focus-saturate` per theme; the `data-focus-scope`
  filter rule + `prefers-reduced-motion` guard — or place the rule in `apps/web/app/globals.css`)
- Modify: `apps/web/components/app/workspace-app.tsx` (add `Shift+F` to the `Shell` keydown handler;
  render `FocusToggle` in the header; add `data-focus-scope` to the board/list `<main>`)
- Test: `apps/web/lib/focus-mode.test.ts` + `apps/e2e/tests/focus-mode.spec.ts`

**Approach:**
- `focus-mode.ts`: `type FocusLevel = "off" | "calm" | "zen"`; `useSyncExternalStore`-backed store;
  `STORAGE_KEY = "boardly-focus"`; `applyFocus(level)` sets/removes `data-focus` on
  `document.documentElement`; `cycle()` advances off→calm→zen→off; `useFocusMode()` returns
  `{ level, cycle, setLevel }`. SSR snapshot = `"off"`.
- `layout.tsx`: extend the inline script (or add a second) to read `boardly-focus` and stamp
  `data-focus` before paint. Keep in sync with `focus-mode.ts` (same note the theme script carries).
- Tokens/CSS: `--focus-saturate` in `:root` (dark, ~`0.4`) and `:root.light` (tuned); rule
  `:root[data-focus="calm"] [data-focus-scope], :root[data-focus="zen"] [data-focus-scope] { filter: saturate(var(--focus-saturate)); transition: filter var(--dur-base) var(--ease-standard); }`
  and `@media (prefers-reduced-motion: reduce) { … { transition: none } }`.
- `FocusToggle`: a ghost `Button`/icon button showing the current level (lucide `Focus` icon; label
  or `aria-label` per level, e.g. "Focus: off/calm/zen"); `onClick={cycle}`. Place next to
  `ThemeToggle`/in the `MainArea` header toolbar.
- `Shift+F` in `Shell`: guarded by `isEditableTarget`; calls `cycle()`.

**Patterns to follow:** `apps/web/lib/theme.ts` (+ `theme.test.ts` if present),
`apps/web/components/app/theme-toggle.tsx`, the `--bg-hover` token in `packages/ui/src/theme.css`,
the `/`-shortcut effect in `workspace-app.tsx`.

**Test scenarios:**
- Happy path (store): `cycle()` advances `off → calm → zen → off` and wraps.
- Happy path (store): `setLevel("calm")` persists `"calm"` to `localStorage["boardly-focus"]`;
  a fresh store read hydrates to the persisted level.
- Edge case (store): an unknown/absent `localStorage` value resolves to `"off"`; `applyFocus("off")`
  removes the `data-focus` attribute (does not leave `data-focus="off"` if the design is
  attribute-absent-when-off — assert whichever the implementation picks, consistently).
- Edge case (store): SSR/no-`window` path returns the `"off"` server snapshot without throwing.
- Integration (e2e, dark + light): toggling to Calm applies `saturate` to the board region while a
  known-red element (overdue chip) stays non-gray (computed `filter` present; color still has
  chroma) — verify in **both** themes.
- Integration (e2e): the detail drawer opened in Calm renders full-color (its computed style has no
  inherited `saturate` — it portals out of `main`).

**Verification:** `Shift+F` and the toolbar button both cycle the level; the board visibly mutes at
Calm and restores at Off; the choice survives reload (no color flash on load); dark and light both
read as "clearly quieter but still legible"; typecheck/lint/tests/build green.

- [x] **Unit 2: Zen density — collapse card face + list row to title + status**

**Goal:** At Zen, the board card face and list row show only the title + a single muted status
marker; all other badges are hidden. Reuses the badge config.

**Requirements:** R3, R5, R6, R7

**Dependencies:** Unit 1 (needs the focus store)

**Unit doc (DoD):** `docs/units/UNIT-F2-focus-mode-zen.md`

**Files:**
- Create: `docs/units/UNIT-F2-focus-mode-zen.md`
- Modify: `apps/web/components/board/column-cards.tsx` (compute effective `config` from
  `useFocusMode()` → `["status"]` when Zen; pass to cards)
- Modify: `apps/web/components/board/list-view.tsx` (Zen → empty the trailing `BadgeRow` config,
  keep the leading `StatusIcon` + title)
- Modify (if needed): `apps/web/components/card/card.tsx` (only if the effective config must be read
  there instead of the container; prefer container-level to avoid per-card store subscriptions)
- Modify: `apps/e2e/tests/focus-mode.spec.ts` (add Zen board + list baselines, dark + light)
- Test: `apps/web/components/card/card.test.tsx` (or `badge-row.test.tsx`) and
  `apps/web/components/board/list-view.test.tsx`; e2e Zen screenshots (dark + light)

**Approach:**
- Read `useFocusMode()` **once per container** (board column list, list-view container), not per
  card — toggling then re-renders the card lists once. Effective config: `zen ? ["status"] : config`.
- Board: `BadgeRow` with `["status"]` renders just the `StatusBadge` (the muted status dot, via the
  Calm/Zen `saturate` already on `main`). List: pass a config that yields no trailing badges; the
  existing leading `StatusIcon` + title remain.
- No new hiding mechanism — this is the existing `config` path with an overridden value.

**Patterns to follow:** existing `config` plumbing in `column-cards.tsx` and `list-view.tsx`;
`BadgeRow` in `apps/web/components/card/badge-row.tsx`.

**Test scenarios:**
- Happy path: with the focus store set to `"zen"`, a rendered board card shows the status badge and
  **no** priority/severity/due/label/link/checklist badges; title still renders.
- Happy path: with `"zen"`, a list row renders shortId + title + leading status icon and **no**
  trailing badge chips.
- Edge case: at `"calm"` and `"off"`, cards/rows render the **full** configured badge set
  (Zen hiding does not leak into the other levels).
- Edge case: a card with no status still renders its title cleanly at Zen (status badge always
  present since every card has a status; assert no crash / empty-row artifacts).
- Integration (e2e, dark + light): switch Board↔List while at Zen — both surfaces stay collapsed;
  screenshot baselines for Zen in both themes.

**Verification:** Zen shows title + status only on both board and list, in both themes; Off/Calm
unaffected; the detail drawer still shows every field; typecheck/lint/tests/build green; dark-mode
screenshot checked against `DESIGN.md`.

## Definition of Done (every unit)

A unit's checkbox may be ticked **only** when all of these hold (this is what the loop enforces):

1. **Docs:** the unit's `docs/units/UNIT-F<n>-*.md` doc is written and committed — what changed, why
   (esp. muted-not-grayscale; attribute-on-`<html>` + filter-scoped-to-`main`; per-theme token),
   how it works, how it was verified (both themes), and any follow-ups.
2. **Tests green:** `pnpm -r test` passes (new unit tests included).
3. **Typecheck + lint + format:** `pnpm -r typecheck`, `pnpm -r lint`, `pnpm format:check` clean.
4. **Build:** `pnpm --filter @boardly/web build` (static export) compiles.
5. **e2e + screenshots (user-facing):** `pnpm --filter @boardly/e2e e2e` green, **including a
   committed dark AND light baseline** for the level(s) this unit introduces, reviewed against
   `docs/design/DESIGN.md`. Dark is verified first, but light is **required** this unit (R6) — not
   deferred.
6. **Design + engineering rules:** shadcn/ui + design tokens (no ad-hoc colors/px); **SVG icons
   only, no glyphs** (`DESIGN.md` §7.1); `prefers-reduced-motion` respected; exact-version deps
   (no new deps expected — if one is truly needed, pin it exactly and justify in the doc).
7. **Commit:** one local commit for the unit (code + tests + doc), footer
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Never push, never create a branch.**

## Preconditions / Environment (read before the loop)

- **Node 22.17.1** — prefix every install/build/test/node command with
  `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"` (machine default is v24).
- **No Docker / no migrations needed** — this feature is entirely client-side (no server, Yjs, or
  DB change). The "Docker+migrations for Phase 3+" gate from the full build plan does **not** apply.
- **Verification server:** the web dev server on `http://localhost:3000` (via `.claude/launch.json`
  "web", or `pnpm --filter @boardly/web dev`) plus the API on `:8787`. The seeded demo board exists
  under `demo@boardly.app` / `demo-boardly-2026` — use it for realistic focus-mode screenshots.
  For committed baselines, prefer the e2e harness (`apps/e2e`, config serves built `out/` on :3000 +
  API :8787); it already captures dark — add a light run (`resize_window`/`colorScheme: "light"` or
  a second project) for the R6 baselines.
- **Both themes:** capture and eyeball Calm/Zen in dark **and** light; tune `--focus-saturate` per
  theme until each reads "clearly quieter but legible."

## Operational Notes — autonomous loop

The plan is ordered and dependency-checked so a loop can run it unattended:

- **Pick** the next unbounded unchecked unit top-to-bottom, respecting **Dependencies** (Unit 2
  needs Unit 1). Implement it end-to-end to the Definition of Done above, commit locally, then tick
  its `- [ ]` → `- [x]` in this file (same commit or a follow-up commit — keep the plan honest).
- **Blocked?** If a unit can't be completed, add a short `> BLOCKED: <reason>` note under it, leave
  it unchecked, and move to the next independent unit. (Unit 2 is blocked until Unit 1 lands.)
- **Never** `git push` and **never** create a branch — local commits only.
- **Done:** when no unblocked unchecked unit remains, make a final commit marking this plan
  `status: complete` (add `focus_mode_completed: YYYY-MM-DD` to the frontmatter) and update
  `docs/design/DESIGN.md` per the Documentation note below.

Suggested loop command:

    /loop 12m Read CLAUDE.md and docs/plans/2026-07-11-001-feat-focus-mode-plan.md. Pick the next
    unchecked implementation unit (respect dependencies). Implement it end-to-end to the plan's
    "Definition of Done (every unit)": tests + typecheck/lint/format/build green; unit + e2e tests
    with committed dark AND light dark-mode screenshots checked against docs/design/DESIGN.md;
    shadcn/ui + design tokens; SVG icons only (no glyphs); prefers-reduced-motion respected;
    exact-version deps; write + commit docs/units/UNIT-F<n>-*.md. No Docker/migrations needed (client
    only). Then commit locally and tick the checkbox. Never push or create branches. If a unit is
    blocked, note it in the plan and move on. WHEN NO UNBLOCKED UNCHECKED UNIT REMAINS: mark the plan
    status complete and update DESIGN.md, then make a final commit.

## System-Wide Impact

- **Interaction graph:** `Shift+F` joins the existing `Shell` keydown handler — must not fire inside
  inputs/textareas (reuse `isEditableTarget`) and must not collide with browser/OS shortcuts
  (`Shift+F` is free; the command palette uses `⌘K`, search uses `/`).
- **Stacking context / DnD:** `filter` on the `main` container creates a new stacking context and a
  containing block for `position: fixed` descendants. dnd-kit's `DragOverlay` and all Radix
  overlays portal to `<body>` (outside `main`), so they're unaffected — **verify** a card drag and a
  card-context popover still render correctly while Calm/Zen is active.
- **Performance (R2/pillar R2):** `saturate` is a compositor-friendly filter, but it repaints the
  scrolled region; verify no scroll/drag jank on a large board (the demo board is a good stress
  case). Do not animate the filter on every scroll — only transition on level *change* (and disable
  under reduced motion).
- **API surface parity:** none — no command-layer, Yjs, or `SavedView` change. Focus is client-only
  appearance state.
- **Unchanged invariants:** `SavedView` (filter/sort/groupBy/layout), `badgeConfig` persistence, and
  all card data are untouched; the theme mechanism is copied, not modified.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `filter` on `main` clips/affects an inline (non-portaled) overlay | Audit: Radix `Sheet`/`Popover` + dnd `DragOverlay` all portal to `body`; e2e-verify drawer + a card popover render full-color and correctly positioned while active. |
| Light theme reads muddy or the muting is imperceptible at the dark-tuned factor | `--focus-saturate` is a per-theme token; tune light by eye in the running app; screenshot both (R6). |
| No-FOUC script drift vs `focus-mode.ts` | Keep the `layout.tsx` stamp minimal and carry the same "keep in sync" note the theme script uses; both read the same `localStorage` key + attribute contract. |
| Per-card store subscription causes re-render churn | Read `useFocusMode()` at the container level and pass config down; do not subscribe per card. |
| Reduced-motion users get a jarring filter transition | Gate the `transition` behind `@media (prefers-reduced-motion: reduce)`. |

## Documentation / Operational Notes

- Update `docs/design/DESIGN.md` — add Focus mode to the components/principles (a new appearance
  mode + the `--focus-saturate` token) so the design system stays current (CLAUDE.md §2).
- No rollout/monitoring concerns (client-only, no migration, no server change).

## Sources & References

- Origin: this conversation (design exploration → Off/Calm/Zen ladder; "muted, not grayscale";
  "reuse badge-visibility for Zen").
- Related code: `apps/web/lib/theme.ts`, `apps/web/app/layout.tsx`,
  `apps/web/components/app/theme-toggle.tsx`, `apps/web/components/app/workspace-app.tsx`,
  `apps/web/components/card/badge-row.tsx`, `packages/ui/src/theme.css` (`--bg-hover`),
  `packages/domain/src/badges.ts`.
- Design rules: `docs/design/DESIGN.md` §2 (encodings), §6 (motion), §7.1 (SVG-only icons).
