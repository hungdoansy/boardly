# UNIT 0.4: `apps/web` Next.js scaffold + Linear theme shell

- **Plan unit:** 0.4 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 0)
- **Status:** done
- **Requirements:** R4 (two platforms, one codebase), R11 (presentation)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-0.4-shell-dark.png`

## What changed

A running **Next.js 16.2.6 static-export** app with **Tailwind v4** + **shadcn/ui** base
components and the dark, Linear-style app shell.

`packages/ui` (shared component + theme package):

- `src/theme.css` — all Boardly design tokens (DESIGN.md) as `:root` CSS variables, plus a Tailwind
  v4 `@theme inline` block mapping them to (a) the shadcn/ui semantic color names
  (`--color-background`, `--color-primary`, `--color-border`, `--color-ring`, …) and (b) Boardly
  utilities (`bg-canvas`/`bg-surface`/`bg-elevated`/`bg-overlay`, `text-fg`/`text-fg-muted`/
  `text-fg-faint`, `border-line*`), the 13px-base type scale, fonts, and radii. Exported via the
  `"./theme.css"` package entry.
- `src/lib/cn.ts` — `cn()` (clsx + tailwind-merge).
- `src/components/{button,badge,dialog,command}.tsx` — shadcn/ui-style components restyled to
  tokens. Button (primary/ghost/outline/danger × sm/default/lg/icon, cva) and Badge are
  React-19-style (ref-as-prop, no `forwardRef`); Dialog (Radix) and Command (cmdk) are `"use client"`
  wrappers.
- `src/index.ts` — barrel export. `package.json` gains Radix/cmdk/cva/lucide deps; React is a
  peer + dev dep; `tsconfig` gets `jsx: react-jsx` + DOM lib.

`apps/web` (Next app):

- `next.config.mjs` — `output: "export"`, `trailingSlash: true`, `images.unoptimized: true`.
- `postcss.config.mjs` — `@tailwindcss/postcss`.
- `app/globals.css` — `@import "tailwindcss"` + the ui theme; `@source "../../../packages/ui/src"`
  so Tailwind scans the workspace UI package (it skips `node_modules` by default); base body styles;
  a global `prefers-reduced-motion` guard.
- `app/layout.tsx` — root layout, self-hosted **Inter** via `next/font/google` (`--font-inter`),
  `html.dark`, metadata.
- `app/page.tsx` — the shell: 240px board-list rail (`bg-surface`, wordmark + beta badge + search +
  board list + account footer), a top bar (board title + **⌘K** affordance), and a `bg-canvas` main
  area with a centered empty state and a primary **Create board** button.
- `package.json` scripts → `dev`/`build` (`next`), `typecheck` (`tsc`), `lint`.

`next-env.d.ts` is gitignored (Next regenerates it, adding a build-only route-types import).
`pnpm-workspace.yaml` gains `onlyBuiltDependencies: []` (sharp's native build is not needed for a
static export).

## Why (decisions)

- **Next pinned to `16.2.6`** (CLAUDE.md fixed version) even though `16.2.10` is out — reproducibility.
- **Tailwind v4 CSS-first, tokens in `packages/ui/src/theme.css`.** One source of truth consumed by
  web now and desktop later. shadcn's semantic names are mapped onto Boardly tokens so pasted/áuthored
  shadcn components "just work" against our palette. Note: shadcn's `accent` = a subtle hover
  surface, so it maps to `--bg-overlay`; the **brand** indigo is `primary`.
- **`@source` the UI package** rather than moving components into the app — keeps the component
  library shared (desktop reuses it) while still getting its utility classes generated.
- **React-19 component style (ref as prop).** Avoids `forwardRef`/`ElementRef` (being phased out) and
  keeps types clean under React 19.2.
- **`next-env.d.ts` gitignored.** Next rewrites it on build to `import "./.next/types/routes.d.ts"`,
  which only exists post-build; committing it would break a pre-build `tsc`. Gitignoring keeps
  standalone `typecheck` robust; `next build` still type-checks everything incl. typed routes.
- **Board route is client-resolved from the URL** (no per-id prerender) — required by static export;
  wired in Unit 1.3+.

## Design (per DESIGN.md)

- **Dark-first**, verified against the dark screenshot. Surfaces use the elevation ladder
  (`--bg-base` canvas → `--bg-surface` rail → `--bg-elevated`/`--bg-overlay`); chrome borders are the
  low-alpha `--border-subtle`/`--border-default`; text uses the primary/secondary/tertiary ramp.
- **One accent** (indigo `--accent`) on the logo tile and the primary button only; everything else is
  monochrome. Type is Inter at the 13px-dense scale (`text-md` headers, `text-base` items, `text-xs`
  meta), headings tracked `-0.01em`.
- **Motion measured:** hover color transitions use `--dur-fast` + `--ease-standard`; no layout
  animation; global `prefers-reduced-motion` guard in `globals.css`.
- **Keyboard/a11y:** every interactive element has a `focus-visible` accent ring; the New-board
  icon button has an `aria-label`; the ⌘K affordance is shown in the top bar.
- Screenshot: `docs/units/screenshots/UNIT-0.4-shell-dark.png` (1280×800, dark).

## How to test / verify

Prefix commands with `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/web build` → compiles + type-checks + emits `apps/web/out/` (static export,
  3 prerendered routes, no server-only-feature errors).
- `pnpm turbo run typecheck` (6/6), `pnpm turbo run lint` (6/6), `pnpm turbo run test` (3/3),
  `pnpm format:check` clean.
- **Screenshot check (dark):** `npx serve apps/web/out -l 4173`, then load `http://localhost:4173/`
  in a headless browser and screenshot — the shell renders the Linear-style dark aesthetic. (Only
  console message is a benign missing-`favicon.ico` 404.)

## Follow-ups / known gaps

- **`favicon.ico`** not yet added (404 in console) — add with app branding in a later polish pass.
- **Dialog/Command animations:** they reference `animate-in`/`fade-in`/`zoom` classes that need the
  `tw-animate-css` utility plugin; it's added when these components are first rendered (Units 2.1 /
  2.9). They build and type-check now but won't animate until then.
- The board list / account row are **static placeholders**; real workspace-doc-backed data lands in
  Unit 1.3. The ⌘K chip is a visual affordance; the palette is Unit 2.9.
- `@testing-library/react` still deferred to the first component unit test (Unit 1.3).
- Light theme + responsive pass: Unit 5.3.
