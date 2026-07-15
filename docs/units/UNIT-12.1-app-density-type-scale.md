# UNIT 12.1: Reduce the app-wide type scale (~1px)

- **Plan unit:** Unit 12.1 (`docs/plans/2026-07-15-001-feat-context-menu-and-density-polish-plan.md`)
- **Status:** done
- **Requirements:** R2
- **Commit(s):** _this commit_

## What changed

- **Type-scale tokens shifted down one step** in `packages/ui/src/theme.css` (`@theme inline`), base
  `13px → 12px` with proportional siblings and line-heights:

  | Token       | before (px/lh) | after (px/lh) |
  | ----------- | -------------- | ------------- |
  | `text-xs`   | 11 / 16        | 10 / 15       |
  | `text-sm`   | 12 / 18        | 11 / 16       |
  | `text-base` | 13 / 20        | 12 / 18       |
  | `text-md`   | 14 / 20        | 13 / 18       |
  | `text-lg`   | 16 / 24        | 15 / 22       |
  | `text-xl`   | 20 / 28        | 18 / 26       |

- **`apps/web/app/globals.css`:** `body { font-size: 13px → 12px }`; `.prose-boardly` markdown headings
  `h1 16 → 15`, `h2 14 → 13`.
- **Hardcoded `text-[Npx]` swept to token classes** (so future scale changes propagate) across 10
  files: `text-[13px] → text-base` and `text-[11px] → text-xs`.
  - `packages/ui/src`: `components/button.tsx`, `components/badge.tsx`, `components/command.tsx`
    (2× `text-base`, 1× `text-xs`), `components/context-menu.tsx` (`itemBase → text-base`,
    `ContextMenuLabel → text-xs`).
  - `apps/web`: `components/card/related.tsx`, `card/status-badge.tsx`, `card/labels.tsx`,
    `board/label-manager.tsx` (×2), `board/import-export.tsx`, `board/views.tsx`.
  - **Deliberately left:** `apps/web/components/board/list-view.tsx:228` keeps `text-[10px]` — a count
    glyph inside a 20px avatar circle where 9px reads too cramped; 10px now equals the new `text-xs`.
- **`docs/design/DESIGN.md` §3** updated: base `13px → 12px`, the scale table, and a new note that the
  scale is absolute-px tokens (so `body` alone doesn't cascade — always use `text-*`, never
  `text-[Npx]`).

## Why (decisions)

- **~1px downward px-shift, not a rem-root refactor** (user choice). The scale is small and discrete;
  keeping the `text-xs…text-xl` token API stable and just re-valuing the tokens gives the same visual
  result as a `rem`-based root knob without rippling into spacing/radii or forcing a much wider
  re-verification.
- **The whole app only shrinks if the hardcoded px literals shift too.** Because the scale is
  absolute px, changing `body`/tokens leaves any `text-[Npx]`-classed element at its old size. Mapping
  those literals to the nearest **token class** (rather than a new raw px) both applies the reduction
  now and future-proofs the next scale change.
- **Icon sizes unchanged.** The slightly higher icon-to-text ratio is intended (denser, more
  Linear-like); spacing/radii tokens are untouched.

## How it works

- Tailwind v4 reads the `--text-*` / `--text-*--line-height` custom properties from the `@theme`
  block, so `text-base`, `text-xs`, … resolve to the new values everywhere at build time. Components
  that already used the token classes shrink automatically; the swept literals now do too.

## How to test / verify

- **No behavioral surface** — this is a pure token/style change. Existing component tests assert text
  _content_, not font size, and stay green.
- Guard: `grep -rn "text-\[[0-9]\+px\]" apps/web packages/ui/src --include="*.tsx" | grep -v test`
  returns only the intentional `list-view.tsx` `text-[10px]`.
- `pnpm typecheck` / `pnpm lint` / `pnpm build` green; `prettier` clean on touched files.
- Dark-mode visual check (board, card face, card detail drawer, card context menu, sidebar): the app
  reads proportionally denser, nothing clips or overflows, badges / counts / mono ids stay legible.

## Follow-ups / known gaps

- `list-view.tsx` retains one raw `text-[10px]`; revisit if the type scale is ever changed again.
- Light-mode inherits the same tokens; a dedicated light-mode density pass is out of scope here.
