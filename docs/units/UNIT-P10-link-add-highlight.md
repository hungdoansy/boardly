# UNIT P10: Highlight the just-added (or re-pasted duplicate) link

- **Plan unit:** ad hoc — no dedicated plan file (interactive request)
- **Status:** done
- **Requirements:** none (interactive request)
- **Commit(s):** _this commit_

## What changed

- `apps/web/components/card/links.tsx` (`CardLinks`):
  - New `highlightId` state marks one link row as "just touched."
  - `add()` now normalizes the submitted URL (`normalizeUrl`, same function `addLink`
    de-dupes with in `packages/sync/src/board-doc.ts`) and checks it against
    `card.links` **before** calling `actions.add`:
    - a match found → that existing link's id is highlighted immediately.
    - no match → an `awaitingNewIdRef` flag is armed; once the resulting
      re-render shows an id not present before, that new link is highlighted.
  - A `useEffect` clears the highlight after `HIGHLIGHT_HOLD_MS` (2000ms).
  - A second `useEffect` scrolls the highlighted row into view (`scrollIntoView({
block: "nearest" })`) via a `data-link-id` attribute + a `listRef` query —
    matters when the de-duped link is scrolled out of view in a long list.
  - The `<li>` row gained `border-l-2 border-l-transparent` (always) and, when
    highlighted, `border-l-[var(--accent)] bg-selected` plus
    `transition-colors duration-[var(--dur-slow)]` for the fade-out.
- `apps/web/components/card/links.test.tsx` — three new tests: highlights a
  newly added link, highlights the existing link when a duplicate (trailing
  slash) is re-pasted, and does not highlight an unrelated existing link in
  that case.
- `docs/design/DESIGN.md` §8 — documented the link-row highlight as a
  concrete instance of the existing selected-row token pair.

## Why (decisions)

- **Client-side de-dupe detection, no change to the command/hook contract.**
  `addLink` already de-dupes by normalized URL and returns the reused link's
  id (`packages/sync/src/board-doc.ts`), but that id isn't available to
  `CardLinks` — `useLinkActions().add()` fire-and-forgets the command and its
  return value is relied on by `apps/web/lib/use-board-links.test.tsx` as the
  synchronization point for the async title-enrichment step. Changing that
  return timing/shape (e.g. resolving early with just the id) would have
  required rewriting that test's await-based assertions. Instead, `CardLinks`
  independently normalizes the URL and searches `card.links` itself — zero
  changes to `use-board.ts`, the `addLink` command, or `board-doc.ts`.
- **Diff-of-ids (not the command's return value) for the "genuinely new"
  case.** Since a new link's id is only known after the doc mutation lands,
  `CardLinks` snapshots the current id set before calling `add`, arms a flag,
  and on the next `card.links` change looks for an id that wasn't in the
  snapshot. This is robust against reordering and title-enrichment updates
  (both change the `card.links` array reference/order but never introduce a
  new id), so it never misfires on unrelated re-renders.
- **Reuse the existing "selected row" token pair, not a new highlight
  primitive.** `--bg-selected` (`bg-selected` utility) + an accent left
  border is already the established "this row is highlighted" language in
  this codebase (`command.tsx`, `context-menu.tsx`'s `data-[highlighted]`
  state, the sidebar project-list/settings active-item styling) and is the
  same pairing `DESIGN.md` §8 mandates for a selected/open card on the board.
  No new color, ring, or animation utility was invented.
- **One-shot fade, not a loop.** `DESIGN.md` §6 explicitly bans looping/
  decorative motion; the row's background/border simply switch on instantly
  and fade back to transparent once over `--dur-slow` (220ms) via
  `transition-colors`, which the global `prefers-reduced-motion` handler
  already collapses to near-instant.
- **2000ms hold before the fade starts.** No existing "attention" duration
  precedent existed in the codebase; picked to sit close to the toast
  default (2500ms, `packages/ui/src/components/toast.tsx`) since both are
  transient "look here" signals, just on a persistent element instead of an
  overlay.

## How it works

1. `add()` trims/canonicalizes the input (unchanged claude-resume handling),
   then computes `normalizeUrl(finalUrl)` and searches `card.links` for a
   link whose own `normalizeUrl(url)` matches.
2. If found, `setHighlightId(existing.id)` fires synchronously — no need to
   wait on the command at all for the duplicate case.
3. If not found, `awaitingNewIdRef.current = true` is armed, then
   `actions.add(...)` runs (unchanged: synchronous `execute(addLink, …)`
   followed by fire-and-forget title enrichment).
4. A `useEffect` keyed on `card.links` compares the current ids against a
   `knownIdsRef` snapshot; if the flag is armed and a new id is found,
   `setHighlightId` fires and the flag is cleared. The snapshot is refreshed
   every run regardless, so later unrelated changes (reorder, title patch)
   are transparent to this check.
5. Two more effects, both keyed on `highlightId`: one sets a 2000ms timer
   that clears the highlight; the other queries the highlighted `<li>` via
   `[data-link-id="…"]` inside the list and scrolls it into view once.
6. The `<li>`'s class list conditionally adds `border-l-[var(--accent)]
bg-selected` when `link.id === highlightId`; removing it lets the existing
   `transition-colors duration-[var(--dur-slow)]` fade the tint back out.

## Design (UI units)

- Tokens used: `--accent` (border), `--bg-selected`/`bg-selected` utility
  (background tint), `--dur-slow` (220ms fade), `transition-colors`
  (compositor-friendly, honors `prefers-reduced-motion` via the existing
  global override in `apps/web/app/globals.css`).
- Pattern: identical to the `data-[highlighted]`/`data-[selected=true]`
  treatment already used in `context-menu.tsx` and `command.tsx` (border-l +
  `bg-selected`), just driven by local component state instead of a Radix
  data-attribute.
- Dark-mode: verified via Playwright against the dev server — a freshly
  added link shows the accent-tinted row immediately, fades out after ~2s;
  re-pasting an existing link (including a trailing-slash variant) re-tints
  that same row without adding a duplicate entry, and an unrelated row stays
  untouched.

## How to test / verify

- Unit tests: `pnpm --filter web exec vitest run components/card/links.test.tsx`
  (14 passing, including the 3 new ones).
- Full web suite: `pnpm --filter web exec vitest run` (220 passing, no
  regressions — `apps/web/lib/use-board-links.test.tsx` untouched since the
  command/hook layer wasn't changed).
- Typecheck: `cd apps/web && pnpm exec tsc --noEmit` clean.
- Lint/format: `pnpm exec eslint components/card/links.tsx
components/card/links.test.tsx` and `pnpm exec prettier --check` on both —
  clean.
- Manual/e2e: ran a throwaway Playwright spec (not committed) against the
  running dev server per the `boardly-e2e-verification` workflow — signed up,
  opened a card, pasted a new link (highlighted immediately, faded after
  ~2.4s), added a second link (highlighted), then re-pasted the first link
  with a trailing slash and confirmed: link count stayed at 2, the first row
  re-highlighted, and the second row did not.

## Follow-ups / known gaps

- The 2000ms hold is a first guess with no product feedback yet — revisit if
  it reads as too long/short once used day-to-day.
- No automated dark-mode screenshot test is committed (screenshots were used
  only for this session's manual verification); the class-based unit tests
  are the durable regression guard.
