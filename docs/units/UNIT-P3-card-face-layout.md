# UNIT-P3 — Card-face layout & unified badge language

Polish pass on the board card face: reorganize the three tiers, lead the title
with the status glyph, and give every info element one consistent Linear-style
chip shell. Requested interactively after Unit 7 landed.

## What changed

**Layout — `apps/web/components/card/card.tsx`**

The card face now reads top-to-bottom in three deliberate tiers:

1. **Title row** — the status glyph leads the title (workflow state first), then
   the title, then the hover-only archive button.
2. **Middle row** — the "what is this" tags: the **project** chip (new on the
   card face), **severity**, and **labels**.
3. **Bottom row** — the metadata line: **priority** at the far left, then the
   **links** cluster; **due date**, **checklist**, and the **ticket id** are
   pushed to the right (`ml-auto`), due immediately left of the checklist.

Badges are routed to a tier by key (`MIDDLE_KEYS`, `BOTTOM_LEFT_KEYS`,
`BOTTOM_RIGHT_KEYS`); the remaining configurable keys (severity, labels) keep
the per-board configured order. The middle row is omitted entirely when it would
be empty (no project and no middle badges); the bottom row always renders
because it carries the ticket id.

**Unified chip shell — `apps/web/components/card/chip.ts` (new)**

`CHIP` / `CHIP_ICON` — a compact, fully-rounded (`rounded-full`) bordered pill.
Every info element wears it so they read as one family; meaning comes from the
icon/dot inside, not from differing container shapes. Restyled to use it:

- `labels.tsx` `LabelChip` — dropped the tinted fill; the **only** colored
  element is the dot. Neutral bordered pill, name in `text-fg`.
- `severity-badge.tsx` — dropped the tinted fill + left-accent bar; `S#` text is
  colored by the severity hue inside the shared shell.
- `due-date.tsx` `DueChip` — dropped the tinted fill; overdue/soon ride the icon
  + text color, normal stays neutral.
- `badge-row.tsx` checklist chip — moved from bare faint text into the shell.
- `priority-badge.tsx` — the glyph is wrapped in `CHIP_ICON` (icon-only pill).

**Project chip — `apps/web/components/card/project-chip.tsx` (new)**

`ProjectChip` renders a Linear-style boxed project: a `lucide-react` `Box` glyph
tinted with the project color + the project name in the neutral foreground.

**Wiring**

- `badge-row.tsx` — extracted `collectBadgeNodes(card, labels, config)` (returns
  `ReactNode[]`) so the card can partition badges across tiers and tell when a
  tier is empty. `BadgeRow` now delegates to it (unchanged behavior for the list
  view, which still renders the full row).
- `board/dnd.tsx` `SortableCard` — threads a new optional `project?: Project`
  prop to `CardFace`.
- `board/column-cards.tsx` — builds a `projectById` map from `useProjects()` and
  passes the resolved project, except in **Zen** focus (project is hidden along
  with the rest of the collapsed face).

The **list view** (`board/list-view.tsx`) is unchanged structurally — it already
leads with a status icon + ticket id and drops `status` from its row config —
but it inherits the restyled chips automatically through `BadgeRow`.

## Why

- **Status-first** matches how the eye scans a Linear board; the glyph anchors
  the title instead of floating in the badge row.
- **One chip shell** fixes the reported "they all look like the same badge"
  problem by making the family *intentional* and pushing differentiation onto
  the icon/dot — the opposite of the old mix (tinted fills, left-accent bars,
  bare text) that read as accidental sameness.
- **Labels as dot-only** keeps color legible for every palette pick (amber,
  slate, pink read poorly as text-on-tint) and avoids competing fills.
- **Metadata pinned bottom-right** (priority left, due/checklist/id right) gives
  every card the same landing spots, so scanning a column is predictable.

Rejected: a colored left "spine" for project (too ambient, no name at a glance)
and an above-title breadcrumb (extra vertical line on every card). The boxed
chip in the tag row won on density + explicitness.

## How it works

`CardFace` derives the three node lists from `config` via `collectBadgeNodes`
with per-tier key filters, prepends the `ProjectChip` to the middle tier, and
lays the bottom row out as `[left cluster] … ml-auto [right cluster + id]`.
Because status/priority/links/due/checklist are placed by hand, `config`
controls only *whether* they show (key present) and the intra-tier order of the
remaining keys.

## How to test/verify

- **Unit** — `apps/web/components/card/card.test.tsx`: new test asserts the
  status glyph leads the card (`getByLabelText(/^Status:/)`) and the derived
  ticket id renders (`#1`). Existing Zen test still passes (status leads title;
  no middle/bottom badges besides the id). `badge-row.test.tsx` unchanged and
  green (text/order assertions are style-agnostic).
- **Suite** — `pnpm --filter @boardly/web exec vitest run` → 166/166; `tsc
  --noEmit` clean; `eslint` clean.
- **Manual (dark mode)** — demo account board: every chip is a fully-rounded
  bordered pill; project shows a boxed glyph + name; labels show a colored dot
  in a neutral pill; the bottom row is priority-left / due·checklist·id-right.
  The detail drawer's LABELS section inherits the dot-only chip. Zen focus hides
  the project chip.

## Follow-ups / known gaps

- The list view does not show the project chip (kept dense/compact). Add it if
  project scanning in list mode is wanted.
- `DESIGN.md` could absorb the `CHIP`/`CHIP_ICON` shell as a documented token if
  more surfaces adopt it.
