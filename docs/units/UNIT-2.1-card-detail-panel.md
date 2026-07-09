# UNIT 2.1: Card detail panel + markdown description

- **Plan unit:** 2.1 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 2)
- **Status:** done
- **Requirements:** R6 (card fields)
- **Commit(s):** _this unit's commit_
- **Screenshot:** `docs/units/screenshots/UNIT-2.1-card-detail-dark.png`

## What changed

Open a card into a right slide-over panel with a `Y.Text`-backed markdown description and its
metadata.

- `packages/sync/src/board-doc.ts` — `setCardDescription(doc, cardId, text, now)`: applies the
  **minimal single-range diff** (common prefix/suffix trimmed) to the description `Y.Text` instead of
  clobbering it, so concurrent edits merge.
- `packages/commands` — `setCardDescription` command + catalog entry.
- `packages/ui` — `Sheet` component (Radix Dialog styled as a right side-panel with slide/fade
  animation).
- `apps/web/components/card/markdown-editor.tsx` — Write/Preview tabs; textarea in Write,
  `react-markdown` + `remark-gfm` in Preview.
- `apps/web/components/card/card-detail.tsx` — the panel: editable title (draft + commit, rejects
  empty), short id, description editor, a read-only Properties list (status/priority/severity/due),
  and Archive.
- `apps/web/components/card/card.tsx` — the card face now **opens the detail on click** (title
  editing moved into the panel; inline card-face editing removed).
- `apps/web/lib/use-board.ts` — `useCardById` + `setDescription` action; board-view owns
  `openCardId` state and renders `<CardDetail>`; `ColumnCards` gains `onOpenCard`.
- `packages/sync/src/use-y.ts` — **`deps` option on `useY`/`useYDoc`** (see the bug fix below).
- Deps: `react-markdown 10.1.0`, `remark-gfm 4.0.1` (web), `tw-animate-css 1.4.0` (web dev, imported
  in `globals.css` — this also enables the Dialog/Command animations noted as a gap in Unit 0.4);
  markdown preview styled via a token-based `.prose-boardly` block.

## Why (decisions)

- **Merge-safe description via minimal diff, still through the command layer.** The plan requires
  character-level Y.Text merge _and_ agent parity. `setCardDescription` takes the full string (agent
  friendly) but its accessor computes and applies only the changed range, so two clients editing
  different parts merge (proven by the sync merge test) rather than one overwriting the other.
- **Click-to-open, title edits in the panel.** A single click opens the detail; keeping inline
  double-click edit on the face fought the click and dnd activation. The face is now purely a
  read/open surface (Linear-like).
- **Read-only Properties for now.** Status/priority/severity/due display live values; their edit
  controls are their own units (2.3/2.4/2.12) — this panel is where they'll mount.
- **Bug fix — `useY`/`useYDoc` cache invalidation (`deps`).** The hooks cache the snapshot and only
  recomputed on doc changes; when `useCardById`'s `cardId` changed (null → id) with no doc change,
  they returned the stale cached `null` and the panel never opened. Added a `deps` option that resets
  the cache when inputs change; `useCardById` passes `[cardId]`. **Caught by the live screenshot
  step**, then locked with a null→id regression test.

## Design (per DESIGN.md)

- Right `sheet` on `--bg-popover`, `border-l`, `0 16px 48px` shadow, slide-in-from-right + backdrop
  fade at `--dur-slow` (DESIGN §6/§7). Header: mono short id + editable title (`text-lg`). Sections
  are `text-xs` uppercase labels. Markdown preview uses the token-based `.prose-boardly` (accent
  links, disc lists, mono code). Archive is the single danger action. All tokens, one accent.
- Dark screenshot: `docs/units/screenshots/UNIT-2.1-card-detail-dark.png` (preview tab, rendered
  markdown).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/sync test` — includes the **concurrent-description-merge** test (two docs
  edit at different positions → both insertions preserved, replicas converge).
- `pnpm --filter @boardly/web test` (31) — CardDetail: opens with title/short id; description edits
  persist to the doc; **markdown renders bold/list/link in preview**; empty editor renders; title
  rename; **null→id deps-invalidation** regression.
- **Critical flow (Playwright, dark):** open a card → type a markdown description → Preview renders
  it → close & **reopen → description persists**; screenshot vs DESIGN.md.
- Full gates: typecheck 7/7, lint 7/7, test (domain 15 / sync 17 / commands 4 / ui 2 / web 31),
  `pnpm --filter @boardly/web build` valid, `format:check` clean.

## Follow-ups / known gaps

- Editable **status/priority/severity/due/labels/links/checklist** controls mount here in Units
  2.2–2.7 / 2.12 (Properties is read-only for now).
- The detail open state is component-local (closes on reload); deep-linking a card in the URL can be
  added with the command palette / search work (2.9/2.11).
- Markdown is rendered with default `react-markdown` (no raw HTML) — safe by default; syntax
  highlighting is out of scope.
