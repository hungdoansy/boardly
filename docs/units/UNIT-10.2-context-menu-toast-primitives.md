# UNIT 10.2: Shared ContextMenu + Toast primitives and clipboard helper

- **Plan unit:** Unit 2 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R3, R5 (infrastructure for later units)
- **Dependencies:** none

## What changed

- **`packages/ui/src/components/context-menu.tsx`** (new) — a themed wrapper around
  `@radix-ui/react-context-menu`, mirroring the existing `popover.tsx`/`command.tsx` idiom
  (Radix parts + `cn` + Boardly tokens). Exports `ContextMenu`, `ContextMenuTrigger`,
  `ContextMenuContent` (portaled), `ContextMenuItem` (with a `variant="destructive"`),
  `ContextMenuSub`/`ContextMenuSubTrigger` (SVG `ChevronRight`)/`ContextMenuSubContent`,
  `ContextMenuRadioGroup`/`ContextMenuRadioItem` (SVG `Check` indicator), `ContextMenuLabel`,
  `ContextMenuSeparator`, `ContextMenuGroup`.
- **`packages/ui/src/components/toast.tsx`** (new) — a minimal toast surface: a module-level
  store (same `useSyncExternalStore` idiom as the app's theme/focus stores) exposing an
  imperative `toast(message)` callable from anywhere, plus a `<Toaster/>` that renders one
  auto-dismissing Radix toast per queued message.
- **`packages/ui/src/index.ts`** — export the new primitives + `toast`.
- **`packages/ui/package.json`** / `pnpm-lock.yaml` — add exact-pinned deps
  `@radix-ui/react-context-menu@2.3.3`, `@radix-ui/react-toast@1.2.19`.
- **`apps/web/lib/clipboard.ts`** (new) — `copyText(text): Promise<boolean>` over
  `navigator.clipboard.writeText`, guarded; returns `false` (never throws) when the API is
  absent or denied. Works in the browser and the Tauri webview.
- **`apps/web/components/app/workspace-app.tsx`** — mount `<Toaster/>` once in `Shell`, as a
  sibling of `<main>` (so its `position: fixed` viewport is clear of the Calm/Zen focus
  `filter` containing block — same class of bug fixed in UNIT-10.1).
- **Tests:** `context-menu.test.tsx` (opens on right-click; `onSelect` fires; submenu trigger
  renders), `toast.test.tsx` (shows one / multiple messages), `apps/web/lib/clipboard.test.ts`
  (writes + true; rejects → false; API absent → false).

## Why

- **Match the existing primitive style.** shadcn/Radix wrappers already back
  dialog/popover/sheet/command here; ContextMenu + Toast are the same pattern, restyled to the
  Boardly tokens in `DESIGN.md` (no second component library).
- **Imperative toast store.** Copy confirmations (Claude-resume copy in UNIT-10.4, "Copy link"
  in UNIT-10.7) fire from event handlers, not render. A module-level store lets `toast()` be
  called without threading a context/provider through the tree — the same approach the theme
  and focus stores already use.
- **Toaster mount point.** Its viewport is fixed-position; mounting it inside the focus-scoped
  `<main>` would reintroduce the UNIT-10.1 offset. Mounting it as a sibling of `<main>` keeps
  it viewport-anchored while the filter stays scoped to `<main>` only.

## How it works

- Radix highlights menu items via `data-[highlighted]` (keyboard + pointer); the item style
  reuses the Command look (accent left-rail + `bg-selected` on highlight). Content and
  sub-content portal to `<body>`.
- `toast(message)` appends `{ id, message }` to a module array and notifies subscribers;
  `<Toaster/>` reads it via `useSyncExternalStore` and renders a Radix `Toast.Root` per item
  with `onOpenChange(false) → dismiss(id)`. Auto-dismiss is Radix's `duration` (2.5s default).

## How to test / verify

- **Unit:** `pnpm --filter @boardly/ui test` → 7 passed (env 2 + context-menu 3 + toast 2);
  `pnpm --filter @boardly/web exec vitest run lib/clipboard.test.ts` → 3 passed.
- **Gates:** `@boardly/ui` + `@boardly/web` `typecheck` and `lint` green; exact-pinned deps
  recorded in `package.json` + lockfile (repo rule §4).
- **Manual (dark mode, `DESIGN.md`):** consumed in UNIT-10.4/10.6/10.7 — a right-click menu
  surface with accent-highlighted items + SVG chevron/check, and a bottom-right toast.

## Follow-ups / known gaps

- The toast is intentionally single-line + auto-dismiss (no actions/undo/stacking policy). A
  richer notification surface is deferred until a feature needs it.
- Submenu open-on-hover is Playwright/manual-verified (Radix sub open needs pointer timing that
  jsdom doesn't drive); the unit test asserts the sub-trigger renders.
