# Boardly — Design System

Binding design spec for all Boardly UI. Aesthetic target: **Linear** — fast, dense, calm,
keyboard-first, content-first, dark-mode-first. Components are built on **shadcn/ui** (Radix
primitives) restyled to the tokens below. This doc is the single source of truth for tokens,
type, spacing, motion, and component usage; components must consume these tokens (as CSS
variables / Tailwind theme), never hardcode values.

> **Priority: dark mode.** All values below are the dark theme (the default). The light theme
> (Unit 5.3) mirrors the same token names under `:root.light` — see §2.1 — so every component
> themes automatically (no `dark:` variants; tokens only). The resolved theme is stamped as a
> `.dark`/`.light` class on `<html>` from the persisted choice or `prefers-color-scheme`, applied
> before first paint by an inline script (no FOUC). Dark remains the SSR/no-JS default.

---

## 1. Principles

1. **Speed is a feature.** Instant interactions, no spinners for local actions, no layout jank. Motion is short and purposeful.
2. **Dense but calm.** Tight spacing and small type like Linear, but with clear hierarchy and generous-enough hit targets (≥ 28px interactive height).
3. **Content first, chrome second.** Low-contrast chrome (borders, backgrounds), high-contrast content (text, the one accent). The board is the hero.
4. **Keyboard-first.** Everything operable without a mouse; focus is always visible and logical.
5. **One accent.** A single indigo accent carries primary actions/selection; color otherwise encodes meaning (status, priority, severity, labels), never decoration.
6. **Restraint in motion.** If an animation doesn't help the user understand a change, cut it.

---

## 2. Color tokens (dark)

Defined as CSS variables on `:root` (dark is default). Expose to Tailwind v4 via `@theme`. shadcn
tokens (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, …) map onto these.

### Surfaces (elevation ladder — darker is lower)

| Token           | Hex                     | Use                                     |
| --------------- | ----------------------- | --------------------------------------- |
| `--bg-base`     | `#08090A`               | App background (deepest)                |
| `--bg-surface`  | `#0E0F11`               | Columns, rails, panels                  |
| `--bg-elevated` | `#161719`               | Cards, popovers, inputs                 |
| `--bg-overlay`  | `#1C1D21`               | Menus, dialogs, active/selected fills   |
| `--bg-hover`    | `rgba(255,255,255,.07)` | Interactive hover fill (see rule below) |
| `--bg-selected` | `rgba(94,106,210,0.14)` | Selected row/card tint (accent-derived) |

**Hover fill rule (binding): use `bg-hover`, never `bg-overlay`, for `:hover`.** Hover is a
_translucent_ token (`--bg-hover`) so it lifts on **any** surface. A solid `bg-overlay` hover is
**invisible on overlay-colored surfaces** — the drawer (`bg-popover`) and every `PopoverContent`
are themselves `--bg-overlay` (`#1C1D21`), so `hover:bg-overlay` there changes nothing. The base
`Button`/`Input` already use `hover:bg-hover`; hand-rolled interactive elements must too. (`--bg-hover`
is per-theme: `rgba(0,0,0,.05)` in light.)

### Borders (low-alpha white — chrome must stay quiet)

| Token              | Value                    | Use                    |
| ------------------ | ------------------------ | ---------------------- |
| `--border-subtle`  | `rgba(255,255,255,0.06)` | Card/column dividers   |
| `--border-default` | `rgba(255,255,255,0.10)` | Inputs, buttons, cards |
| `--border-strong`  | `rgba(255,255,255,0.16)` | Hover/active borders   |

### Text

| Token              | Hex       | Use                                  |
| ------------------ | --------- | ------------------------------------ |
| `--text-primary`   | `#F7F8F8` | Titles, primary content              |
| `--text-secondary` | `#9CA0A8` | Secondary/meta text                  |
| `--text-tertiary`  | `#6B6F76` | Placeholders, hints, disabled labels |
| `--text-disabled`  | `#4A4D54` | Disabled                             |

### Accent (single, indigo — Linear-like)

| Token             | Hex       | Use                                           |
| ----------------- | --------- | --------------------------------------------- |
| `--accent`        | `#5E6AD2` | Primary buttons, selection, focus ring, links |
| `--accent-hover`  | `#6E79DE` | Accent hover                                  |
| `--accent-active` | `#505BC4` | Accent pressed                                |
| `--accent-fg`     | `#FFFFFF` | Text/icon on accent                           |

### Semantic

| Token       | Hex       |
| ----------- | --------- |
| `--success` | `#4CB782` |
| `--warning` | `#E2B341` |
| `--danger`  | `#EB5757` |
| `--info`    | `#4EA7FC` |

Each semantic color has a low-alpha `-bg` variant (~14% alpha) for chip/badge fills.

### Encodings (meaning via color)

**Workflow status** (see plan R14):

| Status      | Color                       | Note                                          |
| ----------- | --------------------------- | --------------------------------------------- |
| Backlog     | `--text-tertiary` `#6B6F76` | dashed/muted icon                             |
| Todo        | `#9CA0A8`                   | empty-circle icon                             |
| In Progress | `#E2B341`                   | half-filled icon                              |
| In Review   | `#5E6AD2`                   | accent                                        |
| Done        | `#4CB782`                   | filled check                                  |
| Canceled    | `#6B6F76`                   | crossed; card face dims + title strikethrough |

**Priority:** Urgent `#EB5757`, High `#E2B341`, Medium `#4EA7FC`, Low `#6B6F76`, None `--text-tertiary` (faint). Use Linear-style bar-height icons, not big blobs.

**Severity:** S1 `#EB5757`, S2 `#F2994A`, S3 `#E2B341`, S4 `#6B6F76`. Rendered as a small solid `S#` pill.

**Label palette** (accessible on dark; user picks per label): slate `#8A8F98`, red `#EB5757`, orange `#F2994A`, amber `#E2B341`, green `#4CB782`, teal `#3DB4B0`, blue `#4EA7FC`, indigo `#5E6AD2`, violet `#9B7EDE`, pink `#E06C9F`. Chips use the color at ~16% alpha fill + full-color text/dot.

### 2.1 Light theme (Unit 5.3)

Same token names re-declared under `:root.light` (`packages/ui/src/theme.css`). Only the
surface / border / text ramps flip; accent, semantic hues, radii, and motion are shared. Cards
and columns are white on a faintly gray canvas, with **low-alpha black** borders providing the
elevation separation (mirroring the dark theme's low-alpha white).

- **Surfaces:** base `#F6F7F8` (canvas) · surface `#FBFBFC` (columns) · elevated `#FFFFFF` (cards) · overlay `#FFFFFF` (popovers) · selected `rgba(94,106,210,0.10)`.
- **Borders:** subtle `rgba(0,0,0,0.06)` · default `rgba(0,0,0,0.11)` · strong `rgba(0,0,0,0.18)`.
- **Text:** primary `#1C1D21` · secondary `#55595F` · tertiary `#82868D` · disabled `#B2B6BC`.
- **Accent:** deepened to `#5058C9` (hover `#464EC0`, active `#3C44B4`) for AA contrast on white; fg `#FFFFFF`.
- **Semantic:** success `#2F9E6B` · warning `#B9862A` · danger `#D63A3A` · info `#2F7FD6` (darkened for light-surface contrast).

Theme selection is a persisted preference (`boardly-theme` = `dark` | `light` | `system`); `system`
follows `prefers-color-scheme` and live-updates. A sidebar toggle flips dark↔light.

---

## 3. Typography

- **Font:** `Inter` (variable) with system fallback (`ui-sans-serif, -apple-system, Segoe UI, …`). Monospace `ui-monospace, "SF Mono", …` for short IDs / code.
- **Base size 13px** (Linear-dense). Scale:
  | Token       | px / line-height | Use                       |
  | ----------- | ---------------- | ------------------------- |
  | `text-xs`   | 11 / 16          | badges, meta, counts      |
  | `text-sm`   | 12 / 18          | secondary UI text         |
  | `text-base` | 13 / 20          | body, card titles, inputs |
  | `text-md`   | 14 / 20          | section headers           |
  | `text-lg`   | 16 / 24          | panel titles              |
  | `text-xl`   | 20 / 28          | page/board title          |
- **Weights:** 400 body, 500 UI/medium (default for most interactive text), 600 headings. Avoid 700.
- **Tracking:** headings `-0.01em` to `-0.02em` (tight, Linear-like); body normal.
- Short IDs (`BRD-142`) in monospace, `text-xs`, `--text-tertiary`.

---

## 4. Spacing, sizing, radii

- **4px base grid.** Spacing scale: 2, 4, 6, 8, 12, 16, 24, 32.
- **Density:** card padding `8px 10px`; column inner padding `8px`; gap between cards `6px`; column gap `12px`.
- **Column width:** 300px (min 272, max 340). Board scrolls horizontally.
- **Interactive heights:** button/input default 30px (`sm` 26px, `lg` 36px); card min-height ~40px.
- **Radii:** `--radius-sm` 5px (badges, inputs, buttons), `--radius-md` 8px (cards, popovers), `--radius-lg` 12px (dialogs/sheets), `--radius-full` 9999px (avatars, status dots, pills).
- **Elevation (dark = subtle, mostly border + faint shadow):**
  - Resting card: border `--border-subtle`, no shadow.
  - Hover card: bg `--bg-overlay`, border `--border-default`.
  - Popover/menu: `0 8px 24px rgba(0,0,0,0.4)` + border `--border-default`.
  - Dialog/sheet: `0 16px 48px rgba(0,0,0,0.5)` + border `--border-default`; backdrop `rgba(0,0,0,0.5)`.

---

## 5. Focus & keyboard

- **Focus ring:** 2px `--accent` outline (or `box-shadow: 0 0 0 2px --bg-base, 0 0 0 4px --accent` for inset-safe rings), **`:focus-visible` only** (no ring on mouse click).
- Every interactive element is tabbable and has a visible focus state in both themes.
- Roving-tabindex for the board grid (cards/columns) so arrow keys move focus (plan Unit 2.10); Enter opens, Space/pickup for drag.
- Command palette (⌘K) is the keyboard hub; document shortcuts in a `?` overlay.

---

## 6. Motion & transitions (measured — do not over-animate)

**Durations:** `--dur-fast` 120ms (hover, small state), `--dur-base` 160ms (popover/dropdown, tooltip), `--dur-slow` 220ms (dialog/sheet, larger surfaces). Nothing over 260ms.

**Easing:** enter `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out, snappy); exit `cubic-bezier(0.4, 0, 1, 1)`; standard `cubic-bezier(0.4, 0, 0.2, 1)`.

**Animate these (they aid comprehension):**

- Hover/pressed background + border color changes (fast).
- Popover / dropdown / tooltip / context-menu enter (fade + 2–4px slide or 98%→100% scale, base).
- Dialog / sheet enter-exit (backdrop fade + panel slide/scale, slow).
- Checkbox check, accordion/expand, status change tick.
- Drag: lifted card gets slight scale (1.02) + shadow + reduced opacity on the source; drop settles instantly (dnd-kit). Keep drag feedback lightweight.

**Do NOT animate:**

- Board/list-wide reflows, column reordering of many items, or anything that animates layout (`top/left/width/height`) on large lists — use `transform`/`opacity` only, and prefer instant for bulk changes.
- Route/page transitions (keep instant — speed pillar).
- Color of large background areas, or long/looping/decorative motion.

**Always:** honor `prefers-reduced-motion: reduce` → disable non-essential transitions (keep instant state changes). Use `transform` + `opacity` (compositor-friendly); never animate `box-shadow` on scroll-critical elements.

---

## 7. Components — shadcn/ui mapping

Build on shadcn/ui; restyle to tokens. Boardly UI → shadcn primitive:

| Boardly UI                              | shadcn/ui base                     | Notes                                                     |
| --------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| Buttons (primary/ghost/outline/danger)  | `button`                           | Primary = accent; ghost is the default for dense toolbars |
| Card detail panel                       | `sheet` (right side)               | Full-screen on narrow viewports                           |
| Modals (confirm, board create)          | `dialog`                           | slow enter, backdrop fade                                 |
| Command palette (⌘K)                    | `command` (cmdk)                   | keyboard hub; fuzzy filter                                |
| Menus (card `⋯`, board actions)         | `dropdown-menu`, `context-menu`    | right-click card → context-menu                           |
| Selects (status, priority, assignee)    | `popover` + `command`, or `select` | status/priority use a searchable popover list             |
| Labels / due / severity pickers         | `popover`                          |                                                           |
| Tooltips (icon buttons, truncated text) | `tooltip`                          | base duration; delay ~300ms                               |
| Inputs / textareas                      | `input`, `textarea`                | 30px height; subtle border → accent ring on focus         |
| Checkbox (checklist)                    | `checkbox`                         | animated check                                            |
| Avatars (assignee)                      | `avatar`                           | 20–24px on card face                                      |
| Tabs (views/settings)                   | `tabs`                             |                                                           |
| Long lists                              | `scroll-area`                      | virtualize if perf demands                                |
| Toasts (sync/errors)                    | `sonner`                           | bottom-right, quiet                                       |

Icons: **lucide-react**, 14–16px on card face, 16–18px in toolbars, `--text-secondary` default, `--text-primary`/accent when active. Provider icons (Slack/Linear/GitHub/Claude) are **bundled SVGs**, not fetched.

**Interaction states come from the base primitives — don't hand-roll them.** Form fields use the
`@boardly/ui` `Input` (border + `hover:border-line-strong` + focus ring + `disabled:opacity-50`);
buttons use `Button` (hover/active/`disabled` per variant, `iconSm`/`icon` sizes for icon buttons).
An icon "add" button next to an input should be a `Button size="iconSm"` and **disable when its
input is empty** — not a bare `<button>` that stays enabled. Any bespoke interactive element must
still carry `hover` (via `bg-hover`), a `focus-visible` ring, and a disabled treatment. Prefer a
shared primitive over a one-off so these states stay consistent across the app.

### 7.1 Iconography — SVG only, never glyphs (binding)

Every icon, symbol, and directional/status affordance in rendered UI is an **SVG
from the icon library** — `lucide-react`, or a bundled provider SVG. **Never use
a Unicode glyph as an icon.** Glyphs render inconsistently across platforms/fonts,
don't inherit `currentColor` or `size-*` cleanly, and can't align to the icon grid.

- **Banned as UI icons:** arrows (`→ ← ↑ ↓ ↔ ⟶ ↗ ⇒`), check/cross (`✓ ✔ ✕ ✗ × ✖`),
  bullets/dots/stars (`• · ◦ ★ ☆`), chevrons/ellipsis (`‹ › » « … ⋯ ⋮`), math/UI
  symbols (`± ∞ ⌄ ⌃`), and emoji used as icons. Use the lucide equivalent
  (`ArrowRight`, `ArrowUpRight`, `Check`, `X`, `ChevronRight`, `MoreHorizontal`, …).
- If a data string carries a glyph marker (e.g. a provider short-label ending in
  ` →` to flag a deep link), **strip it at the render boundary and draw the SVG** —
  don't print the glyph.
- **Allowed (not icons):** literal keyboard keycaps inside `<kbd>` (`⌘ ⌥ ⇧ ↵ ⌫`,
  and `/`), and typographic punctuation in prose/labels (em dash `—`, ellipsis `…`,
  smart quotes). These are text, not iconography.
- Size with `size-*`/`className`, color via `currentColor` (text tokens), `aria-hidden`
  when decorative (give the control its own `aria-label`).

### 7.2 Focus mode (appearance preference)

A one-keypress way to quiet the board when the badges/color pull too much attention. Cycles with
**Shift+F** (and a toolbar `Focus` indicator) through three levels, stamped as `data-focus` on
`<html>` and persisted per-device (`localStorage["boardly-focus"]`, no-FOUC pre-paint stamp) — an
**appearance preference, not a saved-view lens**:

- **Off** — normal (all badges, full color).
- **Calm** — all badges kept, color **muted** via `filter: saturate(var(--focus-saturate))`
  (`0.4` dark / `0.5` light — **muted, never grayscale**, so the overdue/urgent signal stays
  faintly perceptible).
- **Zen** — card face + list row collapse to **title + a single muted status marker** (all other
  badges hidden, reusing the badge config → `["status"]`).

The filter is scoped to the content region (`[data-focus-scope]` on `<main>`), so the portaled
**detail drawer and popovers stay full-color** — quiet board, full context on the one card you open.
The `--focus-saturate` token is per-theme; the toggle transition respects `prefers-reduced-motion`.

---

## 8. Key screens (layout intent)

- **App shell:** left **board-list rail** (~240px, `--bg-surface`), top bar (board title `text-xl`, view switcher, ⌘K hint, account), main board area (`--bg-base`).
- **Board view:** horizontal scroll of columns. Column: header (title `text-md medium`, count, `⋯`, add-card `+`), scrollable card list, footer add-card composer. Optional swimlanes stack horizontally (Unit 4.2).
- **Card face:** title (`text-base`, up to 2 lines), then the **badge row** (Unit 2.6) — status icon, short ID (mono, tertiary), severity pill, due chip, priority icon, label dots, assignee avatar, link chips. Dense, single row, wraps to two max. Hover raises to `--bg-overlay`; selected gets `--bg-selected` + accent left-border (2px).
- **Card detail:** right `sheet` — title, status/priority/severity/assignee/due controls in a compact property list, markdown description, checklist, links, activity. Full-screen sheet on narrow widths.
- **Command palette:** centered `command` dialog, `--bg-overlay`, subtle border + shadow; grouped results; keyboard nav; instant.
- **Auth (login/signup):** centered card on `--bg-base`, minimal, Boardly wordmark, single accent button, inline validation.

---

## 9. Accessibility bar

- Contrast: body text ≥ 4.5:1, large/secondary ≥ 3:1 on its surface (verify tokens meet this on dark).
- All actions keyboard-reachable; visible `:focus-visible`; correct roles/labels on custom controls (Radix handles most).
- Respect reduced motion. Don't encode meaning by color alone — pair status/priority color with an icon/shape and text.
- Hit targets ≥ 28×28px even in dense mode (use padding/hit-slop, not larger visuals).

---

## 10. Do / Don't

**Do:** use tokens; keep chrome quiet and content sharp; one accent; short purposeful motion; test dark first; compose shadcn/ui.
**Don't:** hardcode colors/px; introduce a second accent or a second component library; use Unicode glyphs as icons/affordances (→ ✓ × ⋯ …) — use lucide-react/bundled SVGs (§7.1); animate layout on big lists; add motion without a reason; ship a screen without checking it against this spec and noting the design in the unit doc.
