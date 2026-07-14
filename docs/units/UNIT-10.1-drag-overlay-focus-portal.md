# UNIT 10.1: Fix drag-overlay offset in Calm/Zen focus modes

- **Plan unit:** Unit 1 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R4 (card drag overlay tracks the cursor in all focus modes)
- **Dependencies:** none

## What changed

- **`apps/web/components/board/dnd.tsx`** — the dnd-kit `DragOverlay` is now rendered
  through `createPortal(…, document.body)` instead of inline inside the `DndContext`
  subtree. A `mounted` flag (`useState`+`useEffect`) gates the portal so the static-export
  prerender (where `document` is undefined) renders nothing server-side. The overlay stays a
  JSX child of `DndContext`, so React context (dnd-kit's active-drag state) is preserved.
- **`apps/e2e/tests/drag-focus.spec.ts`** (new) — Playwright regression: in Zen mode, hold a
  drag mid-flight and assert the floating title clone is **not** a descendant of `<main>`
  (i.e. it portaled to `<body>`).
- **`apps/e2e/tsconfig.json`** — added `"lib": ["ES2023", "DOM"]`. The e2e specs use DOM APIs
  (`document`, `getComputedStyle`) inside `page.evaluate` callbacks, which run in the browser;
  the base config is Node-targeted (`lib: ["ES2023"]`) and omitted DOM, so `@boardly/e2e`'s
  `typecheck` was silently red on the pre-existing `focus-mode.spec.ts`. This un-breaks the
  gate and lets the new spec typecheck.

## Why

- **Root cause = CSS containing block.** Calm/Zen stamp `filter: saturate()` on
  `<main data-focus-scope>` (`apps/web/app/globals.css`). A CSS `filter` makes that element
  the containing block for any `position: fixed` descendant. dnd-kit's `DragOverlay` is
  `position: fixed`; rendered inside `<main>`, it was positioned relative to `<main>`'s box
  (offset by the header + sidebar) instead of the viewport — so the dragged card appeared
  detached from the cursor. Off mode has no filter, so the bug only showed in Calm/Zen.
- **Portal, don't drop the filter.** Moving the overlay's DOM node to `<body>` removes it from
  the filtered ancestor chain while leaving the Calm/Zen muting mechanism untouched. Radix
  popovers/sheets already portal to `<body>` for the same reason (the globals.css comment
  notes they "stay full-color"); the overlay was the one un-portaled fixed element.

## How it works

`createPortal` relocates the rendered DOM node to a target container while keeping the element
in its React parent tree (so context/state flow normally). The overlay therefore lives under
`document.body` — a sibling of the app shell, outside `<main data-focus-scope>` — and its fixed
positioning resolves against the viewport in every focus mode.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/web test` → 193 passed (no regression; the board/dnd render
  paths are unchanged apart from the portal wrapper).
- **Typecheck/lint:** `pnpm --filter @boardly/web typecheck`, `pnpm --filter @boardly/e2e typecheck`,
  and both `lint`s are green (e2e typecheck now genuinely passes).
- **e2e (needs the harness — Docker `boardly-db` + a running web/server):**
  `pnpm --filter @boardly/e2e e2e drag-focus` — drives a real drag in Zen and asserts the
  overlay escapes `<main>`. Not run in the authoring session (no harness up).
- **Manual (against `DESIGN.md`):** cycle focus with Shift+F to Calm and Zen, then drag a card —
  the overlay stays under the cursor and the drop lands where expected, matching Off mode.

## Follow-ups / known gaps

- The drag _interaction_ is Playwright-only by repo convention (dnd-kit's pointer sensor does
  not activate under jsdom), so there is no jsdom unit test for the overlay placement.
