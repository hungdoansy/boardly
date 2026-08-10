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
5. **One accent.** A single indigo accent carries primary actions/selection; color otherwise encodes meaning (status, priority, labels), never decoration.
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

**Workflow status.** Status is the **single placement axis** — a card's column IS its status, and
the board renders exactly these eight fixed columns in this left→right order (no add/rename/reorder/
WIP). The values, order, categories, and colors are the single source of truth in
`packages/domain/src/status.ts` (`STATUS_META` / `STATUS_ORDER`); mirror them, never hardcode
elsewhere.

| Order | Status      | Color     | Category  | Icon                                            |
| ----- | ----------- | --------- | --------- | ----------------------------------------------- |
| 1     | Backlog     | `#8A8F98` | unstarted | dashed/muted circle                             |
| 2     | Todo        | `#A0A4AD` | unstarted | empty circle                                    |
| 3     | In Progress | `#F2C94C` | started   | half-filled circle                              |
| 4     | Pending     | `#E2B341` | started   | progress pie (amber, distinct from In Progress) |
| 5     | In Review   | `#4CB782` | started   | near-complete circle                            |
| 6     | Done        | `#5E6AD2` | completed | filled check (accent); card face dims + strike  |
| 7     | Canceled    | `#6B7080` | canceled  | crossed; card face dims + title strikethrough   |
| 8     | Duplicate   | `#565B66` | canceled  | filled-with-cross (gray); dims + strikethrough  |

Cards in a `completed` or `canceled` category (Done, Canceled, Duplicate) render dimmed with a
struck-through title. Each column header shows the status icon (color swatch) + name + live count;
headers are **not** editable. On the right, the header carries an add-card **+** and a 3-dots
(`MoreHorizontal`) **actions menu** (a `dropdown-menu`) — present on **every** column, empty ones
included. Its items:

- **Mark all done** (UNIT-19) — first item; sets every card the column shows **under the active
  filter** to Done, after the same confirmation shape as Archive all (neutral primary button with a
  lucide `Check`). Its leading glyph is the shared done `StatusIcon` in the Done accent, matching the
  card context menu's "Mark done". Omitted when the column is empty **or is the Done column** (there
  it is a no-op); Canceled and Duplicate keep it.
- **Archive all** — archives every card the column currently shows under the active filter (the
  count in the confirmation matches the header count) after a confirmation dialog: the same dialog
  shape as the card Delete confirm, but a neutral primary "Archive all" button (archiving is
  non-destructive). Omitted when the column is empty.
- **Hide** (`EyeOff`, UNIT-18) — drops the column from the board. **No confirmation**: it touches no
  data and the header's Columns menu restores it in one click.

Because every column has a menu, the trigger's accessible name is per column
(`"In Progress column actions"`), not a shared label.

**Column visibility (UNIT-18).** The **view header** holds one **Columns** dropdown, immediately
right of the Board/List switch and left of `Group` — a ghost `sm` Button like its neighbours, reading
`Columns` in `text-fg-muted`, or `Columns · N hidden` in `text-fg` when something is hidden (with an
`aria-label` of `"Columns, N hidden"`). Its icon is `Columns3Cog`, **not** plain `Columns3`: that
glyph is the layout switch's Board icon sitting directly beside it. The control appears only for the
plain board lens — the list layout has no columns, and swimlanes lay out all eight statuses per lane.
It contains a
`DropdownMenuCheckboxItem` per status — status icon + name + right-aligned `tabular-nums` count in
`text-fg-faint`, checked = visible — then a separator, the **Show empty columns** toggle (this
replaced the old standalone toolbar button), and **Show all columns** (disabled when nothing is
hidden). Rows `preventDefault()` their select so the menu survives multiple toggles.

The two rules compose as `!hidden ∧ (showEmptyColumns ∨ count > 0)` — explicit hiding wins, so
neither re-enabling show-empty nor a card landing in a hidden column brings it back. A hidden
column's cards are never archived or filtered, only unlaid-out; the per-row counts are how the user
finds them. Hiding all eight renders a centered "Every column is hidden." with a restore button.
Hiding is **device-local** (localStorage), unlike the synced `showEmptyColumns` — see
`docs/units/UNIT-18-hide-show-columns.md`.

**Priority:** Urgent `#EB5757`, High `#E2B341`, Medium `#4EA7FC`, Low `#6B6F76`, None `--text-tertiary` (faint). Use Linear-style bar-height icons, not big blobs.

**Label palette** (accessible on dark; user picks per label): slate `#8A8F98`, red `#EB5757`, orange `#F2994A`, amber `#E2B341`, green `#4CB782`, teal `#3DB4B0`, blue `#4EA7FC`, indigo `#5E6AD2`, violet `#9B7EDE`, pink `#E06C9F`. Chips use the color at ~16% alpha fill + a full-color dot; the label name renders in the normal foreground (not the raw color) so every palette entry stays legible in both themes.

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
- **Base size 12px** (Linear-dense; reduced one step from 13px in UNIT-12.1). Scale:
  | Token       | px / line-height | Use                       |
  | ----------- | ---------------- | ------------------------- |
  | `text-xs`   | 10 / 15          | badges, meta, counts      |
  | `text-sm`   | 11 / 16          | secondary UI text         |
  | `text-base` | 12 / 18          | body, card titles, inputs |
  | `text-md`   | 13 / 18          | section headers           |
  | `text-lg`   | 15 / 22          | panel titles              |
  | `text-xl`   | 18 / 26          | page/board title          |
- The scale lives as **absolute px** tokens in `packages/ui/src/theme.css` (`@theme`), so a
  size change does **not** cascade from `body` alone — always use the `text-*` token classes
  (never hardcode `text-[Npx]`) so a future scale change propagates everywhere.
- **Weights:** 400 body, 500 UI/medium (default for most interactive text), 600 headings. Avoid 700.
- **Tracking:** headings `-0.01em` to `-0.02em` (tight, Linear-like); body normal.
- Short IDs (`BRD-142`) in monospace, `text-xs`, `--text-tertiary`.

### 3.1 Whole-app zoom (UNIT-15)

- **Zoom = one CSS lever:** `html { zoom: var(--app-zoom, 1) }`. Because the type scale is
  absolute px (above), page `zoom` is how the UI scales — it reflows (more cards fit) and scales
  px tokens, which a base-font-size change cannot. Never use `transform: scale` for this (it
  overflows, breaks `position: fixed`, and doesn't reflow).
- **Two levers by platform (fill correctly).** Element-level CSS `zoom` can't reliably fill the
  window — it paints at `size × zoom` while the containing block doesn't track the factor, and
  Chromium vs WebKit (and zoom-in vs zoom-out) resolve it differently, so no single CSS formula
  fills both. Therefore:
  - **Desktop (Tauri): native webview zoom** — `applyZoom` calls `webview.setZoom(factor)` and pins
    `--app-zoom` to 1. The engine rescales the layout viewport, so it reflows and fills the window
    exactly. This is the correct path.
  - **Web (Chromium/Firefox): CSS `zoom` on `<html>`** as a pragmatic fallback — scales the whole UI
    (incl. body-portaled overlays: dialogs, popovers, command palette, card-detail drawer) and
    reflows, but is standard content-zoom (may gutter on zoom-out / scroll on zoom-in).
  - Rule: **never rely on element CSS `zoom` to fill the window** — use the webview's native zoom on
    desktop; accept content-zoom on web.
- **Shortcuts:** `⌘/Ctrl +` in, `⌘/Ctrl −` out, `⌘/Ctrl 0` reset — same in web and desktop.
  Steps through a fixed ladder (`0.5 … 1 … 2`); `⌘0` snaps back to exactly 100%.
- **Persistence:** the factor is a synced per-user board preference (`Board.zoom`), mirrored to
  `localStorage` (`boardly-zoom`) and restored pre-paint by a no-FOUC inline script (like theme/focus).
- **Never transition `zoom`** — it is reflow-heavy; animating it violates the "don't animate
  expensive layout" rule (§ Motion). Zoom changes apply instantly.
- Discoverable without the keyboard: command-palette actions (Zoom in / out / Reset) and a Zoom
  control in Settings that shows the live percentage.

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
- Command palette (⌘K) is the keyboard hub; a **`?` overlay** documents every shortcut (`ShortcutsOverlay`, opened by `?` or the sidebar help button). **Global keys:** `⌘K` palette, `/` search, `?` shortcuts, `c` new task (opens the Todo composer in the current project scope), `Shift+F` focus mode. **Navigation:** `g` then `p` opens the **Project Switcher** (a `cmdk` dialog that jumps the board scope to any project or All — the keyboard mechanism for moving between projects; also reachable via the palette's "Go to project…"). `⌘/Ctrl 1` jumps to **All** and `⌘/Ctrl 2…5` to the first four projects (the sidebar list starts with All, so All is `1`); `⌘/Ctrl 6` opens the switcher. The All row and the first four project rows carry a faint `1…5` `<kbd>` badge advertising the chord (browsers may reserve `⌘1…8` for tab-switching, so the chord is reliable in the desktop webview). **Board (a card/column focused):** arrows rove, `Enter` opens, `c`/`e`/`p` add-card / archive / priority. Keys render as `<kbd>` keycaps per §7.1 (⌘ and arrows as lucide icons, never glyphs). The `g`-prefixed grammar is a capture-phase leader (`useLeaderHotkeys`) so a sequence beats board single-key shortcuts.
- **ESC is a guarded escape ladder.** It yields to whoever already owns ESC — open Radix dialogs/sheets/palette, inline text edits, active dnd drags. When nothing else owns it, it steps down the full-area panes: close **Settings** if open, else close the **Archive** view if open, else reset the project scope to All. It never steals ESC from those controls.

---

## 6. Motion & transitions (measured — do not over-animate)

**Durations:** `--dur-fast` 120ms (hover, small state), `--dur-base` 160ms (popover/dropdown, tooltip), `--dur-slow` 220ms (dialog/sheet, larger surfaces). Nothing over 260ms.

**Easing:** enter `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out, snappy); exit `cubic-bezier(0.4, 0, 1, 1)`; standard `cubic-bezier(0.4, 0, 0.2, 1)`.

**Animate these (they aid comprehension):**

- Hover/pressed background + border color changes (fast).
- Popover / dropdown / tooltip / context-menu enter (fade + 2–4px slide or 98%→100% scale, base).
- Dialog / sheet enter-exit (backdrop fade + panel slide/scale, slow).
- Checkbox check, accordion/expand, status change tick.
- Drag: lifted card gets slight scale (1.02) + shadow + reduced opacity on the source; drop settles instantly (dnd-kit). Keep drag feedback lightweight. While a drag hovers a column it gains an accent ring; a hovered **empty** column expands its body into a dashed, accent-tinted (`--bg-selected`) drop zone (min-height ≈ a card) so a collapsed column becomes an easy, visible target. The expand appears instantly — **no** height/layout animation (see "Do NOT animate"), and only the hovered column reacts.

**Do NOT animate:**

- Board/list-wide reflows, column reordering of many items, or anything that animates layout (`top/left/width/height`) on large lists — use `transform`/`opacity` only, and prefer instant for bulk changes.
- Route/page transitions (keep instant — speed pillar).
- Color of large background areas, or long/looping/decorative motion.

**Always:** honor `prefers-reduced-motion: reduce` → disable non-essential transitions (keep instant state changes). Use `transform` + `opacity` (compositor-friendly); never animate `box-shadow` on scroll-critical elements.

---

## 7. Components — shadcn/ui mapping

Build on shadcn/ui; restyle to tokens. Boardly UI → shadcn primitive:

| Boardly UI                              | shadcn/ui base                     | Notes                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons (primary/ghost/outline/danger)  | `button`                           | Primary = accent; ghost is the default for dense toolbars                                                                                                                                                                                            |
| Card detail panel                       | `sheet` (right side)               | Full-screen on narrow viewports                                                                                                                                                                                                                      |
| Modals (confirm, board create)          | `dialog`                           | slow enter, backdrop fade                                                                                                                                                                                                                            |
| Command palette (⌘K)                    | `command` (cmdk)                   | keyboard hub; fuzzy filter                                                                                                                                                                                                                           |
| Menus (card `⋯`, column `⋯`)            | `dropdown-menu`, `context-menu`    | right-click card → context-menu; column header 3-dots → dropdown-menu                                                                                                                                                                                |
| Multi-toggle menu rows (board columns)  | `dropdown-menu` `CheckboxItem`     | `role="menuitemcheckbox"`; check indicator is a lucide SVG, right-aligned in a `pr-7` gutter — visually identical to `RadioItem`, only the semantics differ. A menu of several must `preventDefault()` in `onSelect` so it stays open across toggles |
| Toggle row inside a palette             | `command` (cmdk) `Item`            | Not a `CheckboxItem` — see §7.5. Force-mounted, keeps cmdk's `role="option"`, state on `aria-checked`, borrows only the `pr-7` check gutter above                                                                                                    |
| Selects (status, priority, assignee)    | `popover` + `command`, or `select` | status/priority use a searchable popover list                                                                                                                                                                                                        |
| Labels / due pickers                    | `popover`                          |                                                                                                                                                                                                                                                      |
| Tooltips (icon buttons, truncated text) | `tooltip`                          | base duration; delay ~300ms                                                                                                                                                                                                                          |
| Inputs / textareas                      | `input`, `textarea`                | 30px height; subtle border → accent ring on focus                                                                                                                                                                                                    |
| Checkbox (checklist)                    | `checkbox`                         | animated check                                                                                                                                                                                                                                       |
| Avatars (assignee)                      | `avatar`                           | 20–24px on card face                                                                                                                                                                                                                                 |
| Tabs (views/settings)                   | `tabs`                             |                                                                                                                                                                                                                                                      |
| Long lists                              | `scroll-area`                      | virtualize if perf demands                                                                                                                                                                                                                           |
| Toasts (sync/errors)                    | `sonner`                           | bottom-right, quiet                                                                                                                                                                                                                                  |

Icons: **lucide-react**, 14–16px on card face, 16–18px in toolbars, `--text-secondary` default, `--text-primary`/accent when active. Link chips detect ~45 common providers — issue trackers (Linear, GitHub, GitLab, Jira), docs/design/media (Figma, Notion, Confluence, the Google Docs/Sheets/Drive/Calendar/Meet family, Loom, Miro, Dropbox, Spotify, YouTube, Vimeo, Twitch, Behance, Dribbble), work tools (Zoom, Asana, Trello, Airtable, Slack, Discord, WhatsApp, Telegram, Bitbucket, npm, Docker Hub, CodePen, Replit, Stripe), and general web/social (Facebook, Twitter/X, Instagram, LinkedIn, Reddit, TikTok, Pinterest, Medium, Stack Overflow, Wikipedia) — and render one **bundled brand SVG each** from `@thesvg/icons` (github.com/glincker/thesvg) — none fetched over the network. Each icon's `svg` field is a complete, self-contained markup string injected verbatim (`dangerouslySetInnerHTML`, safe here since it's build-time package data, never user/link input); the package's separate `hex` metadata field is unreliable for several brands (wrong for Slack/LinkedIn/Notion in spot checks) so it's never read. Every provider icon renders at a fixed `size-3` (12px) regardless of brand. A brand mark with <3:1 contrast against the card surface, computed via the WCAG relative-luminance formula (GitHub, Notion, Jira, Confluence, Trello, Miro, Twitter/X, TikTok, Medium, Bitbucket, Wikipedia, CodePen) renders via the package's `mono` variant + `currentColor`/`text-fg-muted` instead of its colored default, so it stays legible in both themes. (GitHub's colored `default` asset also has a data bug — mismatched viewBox/path scale — independent reason to prefer its `mono` variant.) Several marks (Figma, Instagram, Reddit, TikTok, Telegram, Zoom, Facebook, the Google Sheets/Calendar/Meet icons) define internal gradient/clip-path ids referenced via `url(#x)`; each render scopes those ids with `React.useId()` (`scope-svg-ids.ts`) so two instances of the same — or a different — icon on the same page never resolve each other's ids.

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
- **Allowed (not icons):** literal keyboard keycaps inside `<kbd>` (`⌥ ⇧ ↵ ⌫`,
  and `/`), and typographic punctuation in prose/labels (em dash `—`, ellipsis `…`,
  smart quotes). These are text, not iconography. **Exception: the command
  (⌘) key** always renders as lucide's `Command` icon, never the glyph — it's
  visually ambiguous at small sizes across fonts.
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

### 7.3 Entity glyphs (binding)

Each domain entity has **one** canonical glyph, reused everywhere it appears (card face, pickers,
menus, sidebar) — never a bespoke shape in one surface. Color always rides on the glyph via
`style={{ color }}` from the domain, never a hardcoded value.

- **Status** → the `StatusIcon` component (`@boardly/ui`), tinted with `STATUS_META[status].color`.
- **Priority** → the `PriorityIcon` component (`apps/web/components/card/priority-badge.tsx`) — the
  bar glyph (Urgent is the filled alert). **Never a colored dot.**
- **Project** → lucide **`Box`** tinted with the project's own `color` (`style={{ color: project.color }}`).
  **Never a bare colored dot.** The **all / multiple-projects** affordance is lucide **`Boxes`**
  (`text-fg-faint`); the **no-project** state is an untinted/faint `Box`. This mirrors the sidebar
  project list, the card project chip, and the project picker.

**Menu / list item shape (binding).** Every row in a context menu, command menu, or picker list has a
**uniform leading-glyph slot** — a `size-3.5` (14px) icon — so text left-edges align down the list.
Every item carries a leading glyph (submenu triggers and "none"/empty options included — no missing
slots), a single text size (`text-base` via the shared item class), and `gap-2` spacing. Icons that
are decorative are `aria-hidden`.

### 7.4 Brand mark & app icon (binding — `@boardly/logo` is the source of truth, UNIT-16)

The Boardly **mark** is an "airy B" — two horizontal D-lobe cards stacked with a waist gap, each on
a **fixed brand indigo gradient** (`#6E79DE→#505BC4` / `#5E6AD2→#4954B8`) over a soft shadow lobe.
The mark's brand colors are a deliberate **exception** to §2/§10's "no hardcoded colors" rule (a logo
is a fixed brand asset, not a themed surface); they are literals in the SVG, not tokens.

- **One source of truth:** the vector lives only in `@boardly/logo` (`packages/logo/assets/mark.svg` +
  the `MARK_SVG` string). Never re-author or copy the markup into a component/app.
- **In-app** (sidebar; `aria-hidden`, wordmark text beside it): render `<BoardlyMark/>` from
  `@boardly/logo` — it inlines the SVG with `useId`-scoped gradient ids (same collision-safety as
  provider icons, §7.1 tooling) and sizes via `className` (default `size-6`). Do **not** use an
  `<img>` for the in-app mark.
- **Favicon:** the bare transparent mark (`/logo/favicon.svg` + a 32px PNG), wired via
  `metadata.icons` in `app/layout.tsx`. Files are copied into the git-ignored `apps/web/public/logo/`
  by `scripts/sync-logo.mjs` on every dev/build.
- **Desktop app icon** (macOS Dock / Windows taskbar): the padded mark (`mark-padded.svg`, ~14%
  padding vs the tight in-app mark) flattened onto a **flat Canvas square** (`#F6F7F8`, = `--bg-base`
  light) → `icon-1024.png`. A flat fill, not a rounded tile — macOS won't round it, so it ships square
  (`generate.mjs` `ICON_BG`). Regenerated via `pnpm logo:generate` (runs `tauri icon` →
  `.icns`/`.ico`/pngs, then prunes to the 5 files `tauri.conf.json` references).
- **Web PWA / apple-touch icon** (`app-icon.svg` → `apple-touch-icon.png`): the mark on a **dark
  slate squircle tile** (`#2A2C42→#15161F`, `rx≈22%`), Linear-style — a tile (not the transparent
  mark) because iOS renders apple-touch icons opaque on the home screen. Rasters come from
  `pnpm --filter @boardly/logo generate`.

### 7.5 Palette toggle rows & the hidden-project marker (binding — UNIT-20)

A **toggle row inside a cmdk palette** (⌘K or `/`) is a control, not a result, and both surfaces
must render it the same way:

- **Force-mount the item _and_ its group** (`forceMount` on each). cmdk drops an ordinary item the
  moment the user types, which is exactly when a "change what you're searching" control has a job —
  the user types a term only an excluded card matches, reads "No results.", and the row that would
  reveal it is gone. Force-mounted items are also excluded from cmdk's registry, so the row never
  props up `filtered.count` and the empty state stays reachable. Mechanics:
  `docs/solutions/integration-issues/cmdk-non-result-rows-in-the-two-palettes.md`.
- **Place the row where it cannot steal the first selection.** cmdk auto-selects the first row in
  the list on every keystroke, and Enter fires whatever is selected. In ⌘K an Actions group already
  sits above the toggle; in `/`, whose primary path is type-then-Enter on the top-ranked card, the
  row goes **after** the results instead. Position is the only thing the two surfaces may differ on
  — same label, same group heading ("Search options"), same everything else.
- **Keep cmdk's own `role="option"` and put the state on `aria-checked`.** A `role` passed to a
  `CommandItem` is silently discarded (cmdk hardcodes its own after spreading props), and a menu
  role inside cmdk's `role="listbox"` would be invalid ARIA. Reuse only the _visual_ half of §7's
  multi-toggle pattern: the right-aligned lucide `Check` in a `pr-7` gutter.
- **No key chord, and nothing in §5's global-keys list.** The row is reached by arrow keys and
  activated with Enter; a bare-letter chord would be swallowed by the palette's own input.
- **`onSelect` flips the state and does not close the dialog** — the result it reveals is the point.
  Closing is always an explicit call in this codebase, so a non-closing row simply omits it.
- **Render the row only when it has something to do** (e.g. only when the board has a hidden
  project). Unlike a fixed menu — where `ColumnsMenu` disables "Show all columns" at zero — a
  palette list is query-filtered content, so absence beats a permanently dead row in the keyboard hub.
- The reveal affordance is lucide **`Eye`**, matching Settings' "Show" action. Never `EyeOff` on a
  control that reveals: `EyeOff` means "hide this" everywhere else, so a _checked_ `EyeOff` row would
  read as "hiding is on".

The **hidden-project marker** (`apps/web/components/search/hidden-project-marker.tsx`, shared by both
surfaces) sits in a result row's trailing cluster, before the mono `shortId`: a `size-3.5`
`aria-hidden` lucide **`EyeOff`** — reporting the _state_ "this project is hidden" — plus the project
name in `text-xs text-fg-faint`, with an adjacent `sr-only` "Hidden project" so the distinction is
never carried by the glyph alone (§9). It is deliberately **not** §7.3's project `Box`: that glyph is
bound to the project's own color, which a search doc doesn't carry, and this marker is about
hiddenness rather than identity. **The marker's text must stay out of the item's cmdk `value`**, or
typing a hidden project's name would match every card it holds.

---

## 8. Key screens (layout intent)

- **App shell:** a user has **one space** (no board list / switcher). Left **sidebar** (~240px, `--bg-surface`) top→bottom: logo → Search → **projects list** (scopes the board; `flex-1`) → **Archive** then **Settings** (the two last full-width nav items, Archive above Settings) → account/theme footer. Main board area is `--bg-base`. Archive and Settings each open a full-pane view (routed by `#archive` / `#settings`, hash-exclusive); the account button and theme toggle stay in the footer.
- **Archive view:** full-pane list (routed by `#archive`, sidebar `Archive` icon) of every **archived** card, most-recently-archived first. Header mirrors Settings (back arrow + "Archive" + count). Each row: status glyph, mono ticket id, title (line-through when terminal), the configured badge row, a relative "archived Nd ago", and hover/focus-revealed **Restore** (`ArchiveRestore`) + **Delete** (`Trash2`) controls. Opening a row (its main region is the button) shows the card in the detail sheet — whose footer swaps **Archive** for **Restore** when the card is archived. Delete reuses the irreversible-delete confirm dialog; Restore is one-click (reversible). Empty state: a calm centered `Archive` glyph + "No archived cards." (Archived _projects_ remain separate, in Settings › Projects › Hidden.)
- **Board view:** horizontal scroll of the **eight fixed status columns** (Backlog…Duplicate, §2 encodings). Column: header (status icon + name `text-md medium` + live count **grouped left**, with an add-card **"+"** pushed to the right — **not** editable, no `⋯`/rename/WIP), scrollable card list, footer add-card composer (new cards default to Todo). The header "+" and the footer composer open the **same** inline composer (as does the `c` shortcut). Which columns render is answered entirely by the view header's **Columns** menu (per-column hide + the synced show-empty-columns flag, default show) — the board area itself is all columns, with no toolbar row of its own. Dragging a card onto a column applies that status immediately; the hovered column shows an accent ring and — when empty — expands into a drop zone (see §8 Motion). Optional swimlanes stack horizontally (read/triage; each lane shows all eight status columns).
- **Card face:** four fixed lines, top to bottom, in a locked order (Unit P3/Unit 5/2026-07-12 card-polish plan — do not reshuffle): **line 1** — ticket id (mono, tertiary, far left) with due chip + checklist meter pushed right; **line 2** — status glyph + title (`text-base`, up to 2 lines); **line 3** — labels (omitted when none); **line 4** — priority icon, then link chips on the left, the project badge pushed to the far right (omitted when all three are empty). Each line wraps independently. No archive affordance on the card face — archive lives in the card detail drawer and the `e` keyboard shortcut. Hover raises to `--bg-overlay`; selected gets `--bg-selected` + accent left-border (2px). Right-clicking a card opens the context menu, whose first action is a one-click **Mark done / Mark not done** toggle (Done ⇄ Todo), above the Status/Priority/Project pickers and Copy-link/Archive/Delete.
- **Card detail:** right `sheet` — title, status/priority/assignee/due controls in a compact property list, markdown description, checklist, links, activity. Full-screen sheet on narrow widths. Adding (or re-pasting a de-duped) link briefly highlights that row with the same `--bg-selected` + accent left-border pairing used for a selected card, fading out after ~2s (`--dur-slow`, one-shot, no loop; UNIT-P10).
  - **Every external link leaves the app, and nothing else moves.** This holds for both link surfaces in the drawer — a row in the **Links** list and a link inside the **description preview** — and is a single rule: web opens a new tab (native anchor, so cmd/middle-click keep working), desktop hands the URL to the OS default browser while the Boardly window stays exactly where it was. A description link must never navigate the sheet, the board, or (on desktop) the whole webview. When the open fails, say so — a `Couldn't open that link` toast, never a dead click (UNIT-9.4).
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
