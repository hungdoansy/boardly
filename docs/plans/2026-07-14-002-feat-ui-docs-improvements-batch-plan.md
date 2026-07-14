---
title: "feat: UI polish + docs-discipline batch (cmd+W, link hover, card sections, board audit)"
type: feat
status: active
date: 2026-07-14
---

# feat: UI polish + docs-discipline batch

## Overview

A batch of six requested improvements spanning three very different surfaces:

1. **Cmd+W closes the current in-app view** on the desktop app (topmost overlay → settings → project scope), instead of closing the only window and quitting like Cmd+Q. (desktop Rust menu + web event bridge)
2. **Link-row action icons reveal on hover only** — the always-on `Copy` (Claude-session) and `ArrowUpRight` (deep-link) icons in the card link list join the hover-reveal pattern the move/remove buttons already use. (one web component)
3. **Related directly above Labels** in the card detail drawer. (one JSX reorder)
4. **Delete button right-aligned** in the card detail footer. (one class)
5. **Main-board UI audit** — an assessment of every board affordance (keep / fix / remove) plus a triaged follow-up backlog. (findings + gated backlog, not blind implementation)
6. **Docs-discipline rule + soft pre-commit warning hook** — sharpen the written rule and add a _non-blocking_ hook that warns when source changes ship without a docs/DESIGN update. (rule + tooling)

Items 1–4 and 6 are concrete, implementation-ready units. Item 5 is an audit whose deliverable is the assessment itself plus a backlog; per its nature (subjective calls + destructive removals) each backlog item is gated on your go/no-go and becomes its own documented unit when greenlit.

All web changes are client-side and fit the static-export constraints. Item 1 adds Rust (Tauri v2) code but no server/schema change. Item 6 introduces the repo's first git-hook mechanism (husky).

## Problem Frame

Papercuts plus one process gap on an otherwise complete personal kanban:

- **Cmd+W quits the app.** The desktop app defines no native menu, so Tauri v2's default macOS Window→Close (`CmdOrCtrl+W`) closes the single window and terminates the process — muscle-memory for "close this thing" nukes the whole app. There is already an Escape "ladder" that closes the current view layer-by-layer; Cmd+W should ride it.
- **Link rows are visually noisy at rest.** Move/remove already hide until hover, but the inline `Copy` and open-arrow icons are always on, so the list reads busier than Linear-calm.
- **Card drawer ordering / alignment.** Related should sit right above Labels; Delete should be at the right end of the footer (destructive action away from the benign Archive).
- **No board-level audit.** Buttons/affordances have accreted across many units (UNIT-5 → UNIT-10); some are dead-on-arrival (Sort on the board layout), inert (⌘K hint), or redundant (4 ways to create a card). A grounded keep/fix/remove pass is overdue.
- **Docs discipline is ~86% but leaks.** 6 of the last 43 feature/spec/design commits shipped with no unit-doc/DESIGN update; there is no automated nudge. The rule exists in CLAUDE.md but isn't reinforced at commit time.

## Requirements Trace

- **R1** — On the desktop app, `Cmd/Ctrl+W` closes the current view (topmost open overlay → Settings → reset project scope), never closes the window or quits; `Cmd+Q` still quits. Standard Edit shortcuts (copy/paste/select-all/undo) keep working. Web build unaffected.
- **R2** — Every per-row action/indicator icon in the card link list is hidden at rest and revealed on row hover **or** keyboard focus; the link's identity (provider icon + label) stays visible. Motion honors `--dur-fast` and `prefers-reduced-motion`.
- **R3** — In the card detail drawer, the `Related` section renders directly above the `Labels` section (target order: Description → Properties → Links → Checklist → Related → Labels → Activity).
- **R4** — The card's Delete control is right-aligned in the drawer footer; Archive stays left; the delete-confirm dialog is unchanged.
- **R5** — A written main-board UI audit exists classifying each board affordance as keep/fix/remove with file:line-grounded rationale, plus a triaged, decision-gated follow-up backlog.
- **R6** — The docs rule is sharpened in `CLAUDE.md` §1 and `AGENTS.md`, and a non-blocking `pre-commit` hook warns when staged source (`apps/**`, `packages/**/src`, `**/src-tauri/**`, excluding tests/e2e) changes with no staged doc surface (`docs/**` or `DESIGN.md`).

## Scope Boundaries

- **Item 1 — no window minimize/hide.** When nothing is open, Cmd+W behaves like Escape at the bottom of the ladder (resets project scope to All, then no-ops). It never minimizes/hides/quits.
- **Item 1 — macOS-first, cross-platform accelerator.** Bind `CmdOrCtrl+W` so Windows/Linux behave consistently, but the target platform is macOS (per repo). The **web** build has no native menu; the browser's own Cmd/Ctrl+W (close tab) is not interceptable and is explicitly out of scope.
- **Item 2 — the provider/identity icon is NOT hidden.** Only action/indicator icons reveal on hover. No new generic "copy URL" button is added (none exists today; flag separately if wanted).
- **Item 6 — warn only, never block.** No blocking/`exit 1` tier; no CI gate (a non-blocking CI mirror is a possible future, deferred). The hook must never fail an install or a commit.
- **Item 5 — audit is not blanket implementation.** No board affordance is removed or refactored as part of _this_ plan without per-item sign-off.

### Deferred to Separate Tasks

- **All board-audit fixes/removals (item 5)** become their own documented units once you approve specific backlog entries (see the backlog table). Removals (e.g., "Add card with details", sidebar Search dialog) especially require sign-off.
- **Blocking docs hook / CI docs-guard mirror**: future, only if the soft warning proves insufficient.
- **A general per-link "copy URL" button**: future, if desired (distinct from the existing Claude-session copy).

## Context & Research

### Relevant Code and Patterns

**Item 1 (Cmd+W):**

- `apps/desktop/src-tauri/src/main.rs` — 68 lines; sets up plugins + keychain commands, then `.run(...)`. **No menu, no `on_window_event`, no `on_menu_event`.** Tauri **v2** (`Cargo.toml` `tauri = "2"`, `@tauri-apps/cli` `2.9.2`, `@tauri-apps/api` `2.11.1`). Single window `label:"main"` in `apps/desktop/src-tauri/tauri.conf.json`; capabilities in `apps/desktop/src-tauri/capabilities/default.json`.
- ESC ladder: `apps/web/components/app/workspace-app.tsx` `useGlobalKeyboard` (~lines 56–92) + `escIsOwnedElsewhere` (~43–48). Real Escape already yields to open Radix dialogs/sheets (which self-close via a **document-level** escape listener) and to active keyboard drag, then handles Settings (`onExitSettings`) and project scope (`setSelectedProject(null)`).
- Open ticket detail is a Radix `Sheet` (`apps/web/components/card/card-detail.tsx`), open-state URL-hash-driven via `useSelectedCard()` (`apps/web/lib/use-boards.ts`); command palette (`apps/web/components/command-palette/palette.tsx`) and search (`apps/web/components/search/search.tsx`) self-close on Escape.
- Both board keyboard hooks bail on modifier chords (`if (e.metaKey||e.ctrlKey||e.altKey) return;`), and a web keydown for Cmd+W never reaches the webview (native menu accelerator intercepts) — **so routing must go native-menu → app event → web listener.**
- Tauri detection: `apps/web/lib/platform.ts` `isTauri()`. `@tauri-apps/api` already a dep (used via `@tauri-apps/api/core` `invoke` in `apps/web/lib/refresh-token-store.ts`). No `@tauri-apps/api/event` usage yet.

**Item 2 (link hover):**

- `apps/web/components/card/links.tsx` — each `<li>` row (≈65–138) is `group flex items-center …`. The **already-hover-reveal** trailing group (≈line 110): `flex items-center opacity-0 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover:opacity-100` holding move-up/move-down/remove. The **always-visible** inline icons: `Copy` (≈line 79, inside the Claude-session `<button>`), `ArrowUpRight` (≈line 106, inside the deep-link `<a>`), both `size-3 shrink-0 text-fg-faint` with no opacity control.
- Same idiom repeated in `apps/web/components/card/checklist.tsx`, `apps/web/components/card/related.tsx`, `apps/web/components/board/label-manager.tsx`, `apps/web/components/settings/project-settings.tsx`. Convention is plain `group`/`group-hover` (no scoped `group/name`).
- Tokens: `--dur-fast: 120ms` (`packages/ui/src/theme.css`); `DESIGN.md` §6 (hover = `--dur-fast`, opacity/transform, honor `prefers-reduced-motion`), §7.1 (SVG icons — already satisfied, these are lucide).

**Items 3 & 4 (card detail):**

- `apps/web/components/card/card-detail.tsx`, `CardDetailBody`. Section container ≈line 98 (`flex flex-1 flex-col gap-5 overflow-y-auto p-4`). Sibling `<section className="flex flex-col gap-2">` blocks in order: Description (99–105), Properties (107–110), Links (112–115), **Related (117–120, `<CardRelated>`)**, Checklist (122–125), **Labels (127–130, `<CardLabels>`)**, Activity (132–135). Footer action row ≈138–162: `flex items-center gap-1 border-t border-line-subtle p-3` holding **Archive** then **Delete** (`variant="ghost" size="sm"`), Delete → `setConfirmDelete(true)`. Confirm `Dialog` ≈164–190 (separate sibling). Tests (`card-detail.test.tsx`) select by accessible name only — **no order/position assertions**. Prior reorder rationale lives in `docs/units/UNIT-P7-*` (commit e31d7a0).

**Item 6 (docs hook):**

- **No git-hook mechanism exists**: no `.husky/`, no `husky`/`lint-staged`/`simple-git-hooks` in root `package.json`, no `prepare` script; `.git/hooks/` has only `*.sample`. Only quality automation is prettier via root `format`/`format:check` (manual). The memory note `boardly-gate-drift` warns: only prettier your own touched files — never `prettier --write .`.
- Rule today: `CLAUDE.md` §1 mandates the unit doc but frames DESIGN/PLAN loosely ("keep current when a change invalidates them"). `AGENTS.md` is a thin pointer.

### Institutional Learnings

- `docs/solutions/` does not exist — no prior recorded solutions.
- Commit-doc audit (last 50): **86%** of feature/spec/design commits are documented-or-split; **6 undocumented** (all in a mid-history card-face/severity burst): `9eb16cb` focus-ring/tab-order, `72409f0` status icon, `b50eb9a` status-column order (spec), `6d158be` link-cluster/"soon"-tier removal (spec+design), `2075606` badge margin (trivial), `daea14b` sidebar box glyph. Every `UNIT-<id>` cited in a subject has a matching file (no dangling refs); the "P" polish series is documented but under-referenced in messages. DESIGN.md updates are bundled with UI only in the UNIT-5 cluster — coverage lags the design surface.
- Project memory: run e2e against an already-running dev server (`boardly-e2e-verification`); seed/demo via `packages/sync/scripts/seed-demo-board.ts` (`boardly-seed-demo-account`); Node pin 24.15.0 / exact-version deps (`boardly-dev-build-dx`, CLAUDE.md §4).

### External References

- Skipped. Local patterns are strong and directly applicable (hover-reveal idiom, Radix escape behavior, Tauri v2 menu API is well-documented). Tauri v2 menu/event specifics (`tauri::menu::{Menu, Submenu, MenuItem, PredefinedMenuItem}`, `App::on_menu_event`, JS `@tauri-apps/api/event` `listen`) are the only external surface; confirm exact API against the installed `2.x` during implementation via Context7 if needed.

## Key Technical Decisions

- **Cmd+W = "programmatic Escape" via a native-menu event bridge.** Rather than build a parallel close-stack, route the native Cmd+W to the _existing, tested_ Escape behavior. Rust defines a custom Tauri v2 menu with a **custom "Close View" item bound to `CmdOrCtrl+W`** (NOT `PredefinedMenuItem::close_window`), keeps `PredefinedMenuItem::quit` on `Cmd+Q`, and on select emits an app event (e.g. `menu://close-view`). The web side (guarded by `isTauri()`) listens and **dispatches a synthetic `keydown` Escape on `document`**, which Radix overlays (document-level escape listener) and the ESC ladder both already handle — reproducing real-Escape semantics across every layer with almost no new logic. _Fallback if a specific layer doesn't respond to a synthetic event: expose an imperative close routine that clears `openCardId`/palette/search state and walks the ladder; decide by testing in the packaged app._
- **Re-add the Edit menu.** Replacing Tauri's default menu drops the macOS Edit menu, breaking Cmd+C/V/X/A/Z in the webview. The custom menu must re-add the standard App + Edit predefined items. This is the main correctness gotcha for item 1.
- **Reuse the hover-reveal idiom for item 2 — zero new patterns.** Apply `opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100` to the two always-on inline icons, plus a focus reveal so keyboard users still see them (the icons live inside the focusable button/anchor, so drive it from the row group's focus, e.g. `group-focus-within:opacity-100`, matching the trailing group's `focus-within:opacity-100`). The provider/identity icon is deliberately excluded.
- **Items 3 & 4 ship as one card-detail unit.** Both are one-file, low-risk edits (move a sibling `<section>`; add `ml-auto`). Combining them is one clean atomic commit. `ml-auto` on Delete (not `justify-between`) stays correct if more left-aligned footer actions are added later.
- **Docs hook is net-new husky, warn-first.** No mechanism exists to extend, so introduce husky (`prepare: "husky"`). The `pre-commit` guard warns (exit 0) when staged source lacks a staged doc surface — matching the repo's low-friction culture and your "whenever possible" framing; it would have surfaced all 6 historical gaps without blocking the trivial one-liners. Bundle **lint-staged running prettier on staged files only**, which simultaneously fixes the known `prettier --write .` footgun (`boardly-gate-drift`). Pin husky + lint-staged exact (§4); `prepare` must no-op outside a git repo (CI/Docker filtered installs).
- **Board audit → findings + gated backlog, not unilateral edits.** The ask ("see what's good / to fix / to remove") is a decision-gathering exercise. Removals are destructive and several fixes are design judgment calls, so the plan records the assessment and a triaged backlog; each approved item becomes its own documented unit (reinforcing item 6).

## Open Questions

### Resolved During Planning

- _Item 3 target order?_ → **Move Related down to sit directly above Labels; Checklist stays above Related** (Links → Checklist → Related → Labels → Activity). (user)
- _Item 6 enforcement strength?_ → **Sharpen the written rule + add a soft (non-blocking) pre-commit warning hook.** (user)
- _Cmd+W when nothing is open?_ → Behaves like Escape's last rung (reset scope to All, else no-op); never touches the window. (default; noted in Scope)
- _Item 2 "the copy button, and others"?_ → The always-on `Copy` (Claude-session) + `ArrowUpRight` (deep-link) inline icons; make them hover-reveal like the existing move/remove group. Provider identity icon stays visible.

### Deferred to Implementation

- Exact Tauri v2 menu construction and whether synthetic-Escape reliably drives every Radix layer vs. needing the imperative fallback — decide by exercising the packaged app.
- Whether `capabilities/default.json` needs an explicit `core:event`/`core:menu` permission entry for the emit/listen bridge (confirm against installed `2.x`).
- Exact pinned versions of `husky` and `lint-staged` (pin at install; record in the unit doc, §4).
- The precise focus-reveal selector for item 2 (`group-focus-within` vs a per-element `focus-visible`) — pick whichever reveals icons when the row's link is keyboard-focused.
- Whether to add a light DOM-order assertion to `card-detail.test.tsx` to lock Related-above-Labels (recommended) vs rely on manual check.
- Guard-script language (POSIX `sh` vs a tiny node `.mjs`) — node is more portable across dev machines; decide at implementation.

## High-Level Technical Design

> _This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce._

**Item 1 — Cmd+W event bridge:**

```
[macOS menu] Cmd+W  ──►  custom "Close View" MenuItem (accelerator CmdOrCtrl+W)
                              │  (NOT PredefinedMenuItem::close_window)
   src-tauri/src/main.rs      ▼
   .on_menu_event ──► window.emit("menu://close-view")
                              │
   apps/web (isTauri only)    ▼
   listen("menu://close-view") ──► dispatch synthetic KeyboardEvent("keydown",{key:"Escape"}) on document
                              │
   existing handlers fire, exactly as a real Escape:
   Radix overlay (doc-level esc) ▸ ESC ladder (settings ▸ project scope ▸ no-op)

[macOS menu] Cmd+Q  ──►  PredefinedMenuItem::quit   (unchanged: quits)
Edit menu (Cmd+C/V/X/A/Z)  ──►  re-added predefined items (must not be dropped)
```

**Items 3 & 4 — card-detail section order (target):**

| Before                             | After                              |
| ---------------------------------- | ---------------------------------- |
| Description                        | Description                        |
| Properties                         | Properties                         |
| Links                              | Links                              |
| **Related**                        | Checklist                          |
| Checklist                          | **Related** ← moved down           |
| **Labels**                         | **Labels** ← now directly below    |
| Activity                           | Activity                           |
| footer: `[Archive] [Delete] · · ·` | footer: `[Archive] · · · [Delete]` |

## Implementation Units

- [x] **Unit 1: Cmd+W closes the current view (desktop menu + web bridge)** — done (`UNIT-11.1`; manual desktop verification pending)

**Goal:** On the desktop app, `Cmd/Ctrl+W` closes the current in-app view via the existing Escape behavior; `Cmd+Q` still quits; text-editing shortcuts still work.

**Requirements:** R1

**Dependencies:** None

**Files:**

- Modify: `apps/desktop/src-tauri/src/main.rs` (build a custom Tauri v2 `Menu` with App + Edit predefined items, a "Close View" `MenuItem` accelerator `CmdOrCtrl+W`, `PredefinedMenuItem::quit`; `.menu(...)` + `.on_menu_event(...)` emitting `menu://close-view`)
- Modify (maybe): `apps/desktop/src-tauri/capabilities/default.json` (event/menu permission if required by installed `2.x`)
- Create: `apps/web/lib/desktop-menu.ts` (`isTauri()`-guarded `listen("menu://close-view", …)` that dispatches a synthetic Escape; dynamic-imports `@tauri-apps/api/event` so the web build stays clean) + `apps/web/lib/desktop-menu.test.ts`
- Modify: `apps/web/components/app/workspace-app.tsx` (invoke the listener setup in an effect; optionally extract the ladder body into a callable for the imperative fallback)

**Approach:**

- Rust: replace the default menu with an explicit one; the crux is (a) do **not** wire Cmd+W to `close_window`, (b) keep `quit` on Cmd+Q, (c) **re-add App + Edit predefined items** so copy/paste/select-all/undo keep working, (d) emit `menu://close-view` on the custom item.
- Web: on mount (desktop only), subscribe to `menu://close-view` and dispatch `new KeyboardEvent("keydown",{key:"Escape",bubbles:true})` on `document`, reproducing a real Escape through Radix + the ESC ladder. Clean up the listener on unmount.
- Keep the web build free of static top-level `@tauri-apps/api/event` imports (dynamic import inside the `isTauri()` branch) so static export is unaffected.

**Execution note:** Verify in the packaged/`tauri dev` app — native menus are OS chrome and cannot be driven by web Playwright.

**Technical design:** _(directional)_ see High-Level Technical Design item 1.

**Patterns to follow:**

- `apps/web/lib/platform.ts` `isTauri()` guard; the dynamic-`@tauri-apps/api` usage shape in `apps/web/lib/refresh-token-store.ts`; the existing ESC ladder in `workspace-app.tsx` (the behavior being reused).

**Test scenarios:**

- Happy path (web unit): invoking the `menu://close-view` handler dispatches a `keydown` Escape on `document` (spy asserts an Escape event was dispatched).
- Edge case (web unit): the listener is registered only when `isTauri()` is true; in a plain jsdom/web env it is a no-op and imports nothing.
- Integration (manual, desktop): with a ticket open, Cmd+W closes the ticket (app stays); in Settings, Cmd+W exits Settings; with a project scope selected, Cmd+W resets to All; with nothing open, Cmd+W does nothing (window stays); Cmd+Q quits.
- Regression (manual, desktop): Cmd+C / Cmd+V / Cmd+A / Cmd+Z work in a text field (proves Edit menu re-added).

**Verification:**

- In `tauri dev`, the four Cmd+W states above behave correctly, the window never closes on Cmd+W, Cmd+Q quits, and text-editing shortcuts work. Web build (`pnpm --filter web build`) still succeeds with no `@tauri-apps/api/event` in the static bundle path.

---

- [x] **Unit 2: Link-row action icons reveal on hover/focus only** — done (`UNIT-11.2`)

**Goal:** The always-on `Copy` and `ArrowUpRight` icons in the card link list hide at rest and reveal on row hover or keyboard focus, matching the existing move/remove behavior; the link identity stays visible.

**Requirements:** R2

**Dependencies:** None

**Files:**

- Modify: `apps/web/components/card/links.tsx`
- Test: `apps/web/components/card/links.test.tsx` (extend; create if absent)

**Approach:**

- Add `opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100` (plus a focus reveal, e.g. `group-focus-within:opacity-100`) to the inline `Copy` (≈line 79) and `ArrowUpRight` (≈line 106) icons. The row is already `group`, so hover/focus of the row drives them.
- Do **not** touch the leading provider/identity icon or the label text. Leave the existing trailing move/remove group as-is (already hover-reveal).
- Confirm `prefers-reduced-motion` still collapses the transition (global reduced-motion handling / opacity is compositor-friendly per DESIGN §6).

**Patterns to follow:**

- The trailing action-group class string already in `links.tsx` (≈line 110); the same idiom in `checklist.tsx`, `related.tsx`, `label-manager.tsx`, `project-settings.tsx`.

**Test scenarios:**

- Happy path: a rendered Claude-session row's `Copy` icon and a deep-link row's `ArrowUpRight` icon carry the `opacity-0` + `group-hover:opacity-100` reveal classes (hidden at rest).
- Keyboard: focusing the row's link button/anchor reveals the icons (focus-reveal variant present/effective).
- Regression: the provider/identity icon is still visible at rest (not made hover-only).
- Regression: the existing move/remove group still reveals on hover (unchanged).

**Verification:**

- Dark-mode screenshots of the link list at rest (action icons hidden) and on hover (icons shown, ~120ms fade), matching the calm density of DESIGN.md.

---

- [x] **Unit 3: Card detail — Related directly above Labels + Delete right-aligned** — done (`UNIT-11.3`)

**Goal:** Reorder the drawer so Related sits directly above Labels, and right-align the Delete button in the footer.

**Requirements:** R3, R4

**Dependencies:** None

**Files:**

- Modify: `apps/web/components/card/card-detail.tsx`
- Test: `apps/web/components/card/card-detail.test.tsx`

**Approach:**

- Move the `Related` `<section>` (≈117–120) to sit immediately before the `Labels` `<section>` (≈127–130) — i.e. after Checklist. Target: Description → Properties → Links → Checklist → Related → Labels → Activity. Clean cut/paste of a self-contained sibling block (identical wrapper, no conditionals).
- Add `ml-auto` to the Delete `<Button>` in the footer row (≈138–162) so it pushes to the right end; Archive stays left. Do not touch the confirm `Dialog` (≈164–190) or Delete's `onClick`.

**Patterns to follow:**

- The prior card-detail reorder in `docs/units/UNIT-P7-*` (commit e31d7a0) for ordering rationale; the footer's existing flex-row conventions.

**Test scenarios:**

- Happy path: in the rendered drawer, the `Related` heading precedes the `Labels` heading with no other section between them (DOM-order assertion, recommended to add).
- Happy path: the Delete button carries `ml-auto` (right-aligned); Archive remains before it.
- Regression: clicking Delete opens the confirm dialog; confirming deletes, cancel does not (unchanged); existing name-based selects in `card-detail.test.tsx` still pass.

**Verification:**

- Dark-mode screenshot of the open drawer showing Related directly above Labels and Delete at the right end of the footer.

---

- [x] **Unit 4: Docs-discipline rule + soft pre-commit warning hook** — done (`UNIT-11.4`)

**Goal:** Sharpen the written docs rule and add a non-blocking pre-commit hook that warns when source changes ship without a docs/DESIGN update; also prettier-on-staged only.

**Requirements:** R6

**Dependencies:** None

**Files:**

- Modify: `CLAUDE.md` (§1 — add the explicit same-commit doc clause + a "design change → DESIGN.md" checklist + "cite `UNIT-<id>` in the subject")
- Modify: `AGENTS.md` (add the same enforceable clause verbatim so agents see it without dereferencing)
- Modify: root `package.json` (devDeps `husky`, `lint-staged` exact-pinned; `"prepare": "husky"`; `lint-staged` config = prettier on staged files only)
- Create: `.husky/pre-commit` (runs the guard, then lint-staged)
- Create: `scripts/check-docs-touched.mjs` (the warn-only guard) + `scripts/check-docs-touched.test.mjs`
- Modify: `pnpm-lock.yaml` (lockfile for the two new deps)

**Approach:**

- Written rule: a commit changing product source (`apps/**`, `packages/**/src`, `**/src-tauri/**`) should stage at least one doc surface in the same commit — a `docs/units/UNIT-<id>-*.md` (feature/spec/behavior), `docs/design/DESIGN.md` (any visual/interaction/icon/token change), or `docs/plans/*` / `PLAN.md` (scope). Bug-fix/micro-polish updates the owning unit doc's "Follow-ups" or a one-line note. Explicitly list the recurring gap types (icon swaps, glyph choices, focus-ring/tab-order, new reusable primitives) as in-scope for DESIGN.md.
- Guard script: read `git diff --cached --name-only`; `code_touched` = staged path under `apps/`, `packages/**/src`, or `**/src-tauri/` excluding `*.test.*`/`*.spec.*`/`apps/e2e/**`; `doc_touched` = staged path under `docs/` or `DESIGN.md`/`PLAN.md`. If `code_touched && !doc_touched` → print a yellow reminder listing the staged source files + the three doc surfaces, **always `exit 0`**. Factor the classification into a pure function so it can be unit-tested against a supplied file list.
- Bundle lint-staged (prettier `--write`/`--check` on staged files only) — resolves the `prettier --write .` footgun from `boardly-gate-drift`.
- `prepare: "husky"` must no-op cleanly when there's no git dir (CI/Docker filtered install) — husky handles this; verify the prod Docker build still installs.

**Execution note:** Add the guard's pure classifier first with tests, then wire the hook.

**Patterns to follow:**

- Repo exact-version pinning (§4); the existing `format`/`format:check` prettier scripts in root `package.json`; the memory rule to prettier only touched files.

**Test scenarios:**

- Happy path: file list `["apps/web/components/card/links.tsx"]` → classifier says "warn" (source, no doc).
- Happy path: `["apps/web/…/links.tsx","docs/units/UNIT-x.md"]` → "ok" (no warn).
- Edge case: `["docs/design/DESIGN.md"]` counts as a doc surface → source+DESIGN → "ok".
- Edge case: `["apps/web/…/links.test.tsx"]` and `["apps/e2e/tests/foo.spec.ts"]` → "ok" (tests excluded, no warn).
- Edge case: `["apps/desktop/src-tauri/src/main.rs"]` → "warn".
- Invariant: the guard process exits 0 in every case (never blocks) — assert exit code.
- Config: lint-staged runs prettier only on staged globs (assert config shape), not repo-wide.

**Verification:**

- `git commit` touching only a source file prints the warning and still commits; touching source + a doc prints nothing; `pnpm install` runs `prepare` without error; the prod Docker install path is unaffected.

## Main-Board UI Audit & Follow-up Backlog (Item 5)

This is the deliverable for item 5: an assessment, not queued implementation. Each backlog row becomes its own documented unit **only when you greenlight it** (and will itself follow the item-6 docs rule).

### Assessment summary

**Keep as-is (working + on-design):** drag-drop status-on-drop + keyboard drag (`dnd.tsx`); keyboard nav / focus-restore / escape ladder (`keyboard-nav.tsx`, `workspace-app.tsx`); card face locked layout + chips + `LinkCluster` (`card.tsx`, `link-cluster.tsx`); card right-click context menu with delete-confirm (`card-context-menu.tsx`); project list + inline rename + context menu (`project-list.tsx`); LayoutSwitch, GroupMenu, ViewsMenu/FilterBuilder, FocusToggle, ThemeToggle, Import/Export.

### Backlog — Fixes (ranked by impact; low-risk, likely greenlight)

| ID  | Issue                                                                                                          | Where                                                 | Suggested change                                                            | Severity          |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| B1  | **SortMenu is dead on the board layout** — user changes sort, nothing happens (board ignores `sort`)           | `components/board/views.tsx:90` + `board-view.tsx:32` | Disable/hide Sort in board layout, or thread `sort` through `BoardView`     | High (functional) |
| B2  | **Selected/open card has no board highlight** (DESIGN §8 mandates `--bg-selected` + accent left-border)        | `components/card/card.tsx` (state absent)             | Thread `selected` from `openCardId` into `CardFace`, style per §8           | High (spec gap)   |
| B3  | **⌘K header hint is inert** — looks like a button, isn't                                                       | `workspace-app.tsx:284`                               | Make it click-to-open, or merge the hint into the Search entry              | Med (confusing)   |
| B4  | **Column header is a no-op `<button>`** (a11y smell, no hover)                                                 | `components/board/column.tsx:32`                      | Use a focusable non-button (`tabIndex`/`role`) instead of a button          | Med (a11y)        |
| B5  | **Saved-view delete is a bare `<svg onClick>`** — not keyboard/SR reachable                                    | `components/board/views.tsx:279`                      | Nest a real `<button aria-label="Delete view">`                             | Med (a11y)        |
| B6  | **Card `<article>` click lacks role/label** — open action not exposed to SR (keyboard path exists via wrapper) | `components/card/card.tsx:58`                         | Add `role="button"`+label, or drop the face onClick and rely on the wrapper | Med (a11y)        |
| B7  | **Empty-column toggle consumes a full-width row** for one right-aligned control                                | `board-view.tsx:110`                                  | Fold the toggle into the header toolbar                                     | Low (layout)      |
| B8  | **Hardcoded drag-overlay shadow** (`rgba(0,0,0,0.4)`) instead of a token                                       | `dnd.tsx:120`                                         | Move to a shared shadow token (value already matches §4)                    | Low (token)       |
| B9  | **Decorative swatch `hover:scale-110`** (DESIGN §6 discourages ornamental motion)                              | `project-list.tsx:144` (+ label-manager rings)        | Replace scale with a ring/opacity change                                    | Low (motion)      |
| B10 | "Export" trigger label under-describes a menu that also imports                                                | `components/board/import-export.tsx:88`               | Relabel trigger (e.g. "Import / Export")                                    | Low (copy)        |

### Backlog — Removals (need your go/no-go; destructive/parity risk)

| ID  | Candidate                                     | Where                                                    | Why remove                                                                                                                                | Risk                                                                                       |
| --- | --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| R-a | **"Add card with details" per-column button** | `components/card/card-composer.tsx:63-107`               | Redundant 4th create path (quick-add, `c` key, ⌘K already exist); only collects a title then opens the drawer; unclear `PanelRight` glyph | Low                                                                                        |
| R-b | **Sidebar Search as a separate dialog**       | `workspace-app.tsx:158` + `components/search/search.tsx` | Duplicates ⌘K card search                                                                                                                 | **Medium — verify the dialog has no scope/ranking the palette lacks before consolidating** |

### Also flagged (behavioral clarity, not necessarily a fix)

- Grouped/swimlane view silently drops the empty-column toggle **and** drag-drop (`board-view.tsx:94-106`) — intentional read-view, but undocumented to the user; consider a hint. (UNSURE)
- Calm `saturate()` filter animates a large region — brushes DESIGN §6 but explicitly sanctioned by §7.2 (reduced-motion honored). Leave. (UNSURE)

## System-Wide Impact

- **Interaction graph:** Item 1 introduces a native-menu→web event path; the synthetic-Escape approach means it flows through the _same_ Radix + ESC-ladder handlers as a keypress (no new close logic to keep in sync). Item 6 adds a commit-time hook — affects every committer/agent (warn only).
- **Error propagation:** Item 1 — the web listener must be `isTauri()`-guarded and its `@tauri-apps/api/event` import dynamic, so the static web build never pulls Tauri APIs. Item 6 — the guard must never throw/`exit 1`; `prepare` must not fail installs without git.
- **State lifecycle risks:** Item 1 — the open ticket Sheet is URL-hash state; the synthetic Escape closes it via Radix→`onClose`→`closeCard` (hash cleared), same as today; the imperative fallback (if used) must clear that same state, not just hide the DOM.
- **API surface parity:** None of these touch the command layer / MCP / REST (no agent-native parity concern) — they are UI/desktop-shell/process changes. (Item 5 backlog items that later touch behavior would.)
- **Integration coverage:** Item 1's native menu is not reachable by web e2e — verified manually in the desktop app (state honestly in the unit doc). Item 6's hook behavior is proven by unit-testing the pure classifier + a manual commit check.
- **Unchanged invariants:** ESC ladder semantics, Radix overlay behavior, the command layer, static-export constraints, the existing link move/remove hover group, the delete-confirm dialog, and `Cmd+Q`=quit all remain unchanged. No schema/migration, no server change.

## Risks & Dependencies

| Risk                                                                               | Mitigation                                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom Tauri menu drops the Edit menu → copy/paste/select-all break in the webview | Explicitly re-add App + Edit predefined items; manual regression test of Cmd+C/V/A/Z in a text field.                                                                                    |
| Synthetic Escape doesn't drive a given Radix layer (trust/target)                  | Radix escape is a document-level listener that doesn't require `isTrusted`; if a layer still misbehaves, fall back to an imperative close routine (decided by testing the packaged app). |
| `@tauri-apps/api/event` leaks into the static web bundle                           | Dynamic-import inside the `isTauri()` branch; verify `pnpm --filter web build` output.                                                                                                   |
| Item 2 hover-only hides an affordance from touch/no-hover users                    | Keep the focus reveal (keyboard) and note that desktop is the primary target; move/remove already behave this way, so it's consistent, not new.                                          |
| husky `prepare` breaks CI/Docker filtered installs (no git)                        | husky no-ops outside a git repo; verify the prod Docker install path; hook is warn-only regardless.                                                                                      |
| New deps (husky, lint-staged) drift from the exact-pin rule                        | Pin exact resolved versions at install; record in the unit doc (§4); commit lockfile.                                                                                                    |
| Board-audit backlog balloons into unplanned work                                   | Backlog is decision-gated; removals need explicit sign-off; each approved item is its own documented unit.                                                                               |

## Documentation / Operational Notes

- Per repo §1 (and item 6 itself), each of Units 1–4 ships a committed `docs/units/UNIT-<id>-<slug>.md` (What/Why/How/Test/Follow-ups) with exact-version deps recorded. Item 1 and item 2 are visual/interaction changes → also note in `docs/design/DESIGN.md` if a reusable token/pattern emerges (item 1: none; item 2: reuses an existing idiom, likely no DESIGN change; item 4: the hook/rule is a process change, documented in CLAUDE.md/AGENTS.md, not DESIGN).
- Update the `boardly-gate-drift` project-memory note once lint-staged lands (the `prettier --write .` footgun is then mechanically avoided).
- No rollout/migration concerns (client + dev-tooling only). Optionally add a Claude-session or hidden-project fixture to `seed-demo-board.ts` only if useful for manual verification.

## Sources & References

- **Desktop / Cmd+W:** `apps/desktop/src-tauri/src/main.rs`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/web/components/app/workspace-app.tsx`, `apps/web/lib/platform.ts`, `apps/web/lib/refresh-token-store.ts`, `apps/web/components/card/card-detail.tsx`, `apps/web/lib/use-boards.ts`
- **Links:** `apps/web/components/card/links.tsx`, `packages/ui/src/theme.css`, `docs/design/DESIGN.md` §6/§7.1, and the hover-reveal siblings (`checklist.tsx`, `related.tsx`, `label-manager.tsx`, `project-settings.tsx`)
- **Card detail:** `apps/web/components/card/card-detail.tsx`, `docs/units/UNIT-P7-*` (commit e31d7a0)
- **Docs discipline:** `CLAUDE.md` §1, `AGENTS.md`, root `package.json`, commit-audit of the last 50 commits (gaps: `9eb16cb`, `72409f0`, `b50eb9a`, `6d158be`, `2075606`, `daea14b`)
- **Board audit:** `apps/web/components/app/workspace-app.tsx`, `apps/web/components/board/{views,board-view,column,column-cards,dnd,project-list,card-composer,swimlanes,import-export}.tsx`, `apps/web/components/card/{card,card-context-menu,link-cluster}.tsx`, `docs/design/DESIGN.md` §6/§8/§9
- **Related prior plan:** `docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`
