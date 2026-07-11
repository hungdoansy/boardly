# UNIT F1: Focus mode — preference + Calm (mechanism)

- **Plan unit:** F1 (`docs/plans/2026-07-11-001-feat-focus-mode-plan.md`)
- **Status:** done
- **Requirements:** R1 (one control cycles), R2 (Calm = muted, not grayscale), R4 (persisted
  preference, not a lens), R6 (both themes), R7 (repo rules)
- **Dependencies:** none
- **Commit(s):** _this unit's commit_

## What changed

The full focus-mode machinery plus the **Calm** level. After this unit, cycling reaches
Off ↔ Calm (Zen is a no-op until Unit F2).

- **`apps/web/lib/focus-mode.ts`** (new) — a module-level store mirroring `lib/theme.ts`:
  `type FocusLevel = "off" | "calm" | "zen"`, `useSyncExternalStore`-backed, persisted to
  `localStorage["boardly-focus"]`. `applyFocus(level)` stamps `data-focus="calm"|"zen"` on
  `<html>` (attribute **absent** when off). Pure helpers `nextLevel` (Off→Calm→Zen→Off) and
  `parseLevel`. `useFocusMode()` returns `{ level, setLevel, cycle }`; `cycleFocus()` is an
  imperative cycle for the global key handler (no stale React closure).
- **`apps/web/components/app/focus-toggle.tsx`** (new) — a ghost `Button` (lucide `Focus` icon +
  level label "Focus"/"Calm"/"Zen") that cycles on click; `aria-label`/`title` name the level and
  the Shift+F shortcut. Active (calm/zen) tints `text-fg`, off is `text-fg-muted`.
- **`apps/web/app/layout.tsx`** — a second no-FOUC inline script (`FOCUS_INIT`) stamps `data-focus`
  from `localStorage` before first paint, so the board doesn't flash full-color then mute. Kept in
  sync with `focus-mode.ts`.
- **`packages/ui/src/theme.css`** — new `--focus-saturate` token, **per theme**: `0.4` (dark
  `:root`), `0.5` (light `:root.light`). Muted, never grayscale (0).
- **`apps/web/app/globals.css`** — the scoped filter rule:
  `:root[data-focus="calm"] [data-focus-scope], :root[data-focus="zen"] [data-focus-scope] { filter: saturate(var(--focus-saturate)); transition: filter … }`.
  The existing global `prefers-reduced-motion` block neutralizes the transition (R7).
- **`apps/web/components/app/workspace-app.tsx`** — `Shift+F` added to the `Shell` keydown handler
  (guarded by `isEditableTarget`, no modifiers) calling `cycleFocus()`; `<FocusToggle />` in the
  `MainArea` header toolbar (shown when a board is active); `data-focus-scope` on the board/list
  `<main>`.
- Tests: `apps/web/lib/focus-mode.test.ts` (new), `apps/e2e/tests/focus-mode.spec.ts` (new) +
  committed dark & light Calm baselines.

## Why (key decisions)

- **Muted, not grayscale.** Calm uses `filter: saturate(0.4/0.5)`, not `grayscale()`. Grayscale
  destroys the *meaning* of color (overdue-red and done-green collapse to the same gray); saturate
  lowers only the *loudness*, so the overdue/urgent signal you'd still glance for survives. The
  demo-board screenshots confirm the red `S1`/`Overdue` chips stay faintly warm at Calm.
- **Attribute on `<html>`, filter scoped to `<main data-focus-scope>`.** The Radix `Sheet`/`Popover`
  and dnd-kit `DragOverlay` all portal to `<body>` — outside the filtered region — so the detail
  drawer and popovers stay full-color for free (R5). Verified: the open drawer's computed filter
  carries no `saturate`.
- **Per-theme token.** Light surfaces are white, so the same factor reads a touch stronger — light
  mutes a little less (`0.5` vs `0.4`). Declared per theme so it's tunable without touching
  components (R6).
- **Preference, not a lens.** Mirrors the theme store exactly (localStorage + `<html>` stamp +
  pre-paint script). No Yjs, no `SavedView` change.
- **Imperative `cycleFocus()`** for the global keydown avoids a stale-closure bug from binding a
  React `cycle` in a `[]`-dep effect.

## How to test / verify

Prereqs: Node 22.17.1; the e2e harness (Docker `boardly-db` up; serves built `out/` on :3000 + API
:8787). No migrations (client-only).

- **Unit:** `pnpm --filter @boardly/web test` → **136 passed** (4 new: `nextLevel` cycle,
  `parseLevel` fallback, `applyFocus` set/remove attribute, `setFocusLevel` persist+apply).
- **e2e:** `pnpm --filter @boardly/e2e e2e focus-mode` → green. Covers: `Shift+F` cycles Off →
  Calm; the content region computes `saturate(0.4)` dark / `saturate(0.5)` light (per-theme token);
  the toolbar reflects the level; the detail drawer opened at Calm is **not** desaturated (portals
  out); Calm → Zen → Off clears the filter. Plus committed **dark and light** Calm baselines
  (`apps/e2e/snapshots/focus-mode.spec.ts-snapshots/focus-calm-{dark,light}-chromium-darwin.png`),
  scoped to `main` so the per-run sidebar avatar doesn't drift.
- **Gates:** `pnpm -r typecheck` / `-r lint` / `format:check` clean; `pnpm --filter @boardly/web
  build` compiles.
- **Manual (against `DESIGN.md`):** on the seeded demo board, Off vs Calm in both themes — colors
  visibly quiet at Calm while text stays legible and the overdue/urgent chips remain perceptible.

## Follow-ups / known gaps

- **Zen is a no-op** until Unit F2 (it stamps `data-focus="zen"` and mutes like Calm, but the badge
  collapse to title + status lands in F2).
- The committed e2e baseline board is minimal (plain cards) — it locks the mechanism + both themes;
  the richer muting is best seen on the demo board (verified manually, not committed).
- `--focus-saturate` values (0.4 / 0.5) are a first pass; easy to tune in `theme.css` later.
