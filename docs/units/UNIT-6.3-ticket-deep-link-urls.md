# UNIT-6.3 — Linear-style ticket deep-link URLs

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 3).

## What changed

Opening a ticket now produces a Linear-style URL hash — `#TEC-1234-fix-login` (or `#1234-fix-login` when the prefix is empty). The board is implicit (Boardly is single-board), and the hash resolves by its **integer** — the prefix and title slug are cosmetic.

- **`packages/domain/src/ids.ts`** — added three pure helpers:
  - `slugify(title)` — kebab-cases a title (fold diacritics, collapse non-alphanumerics, cap 60 chars) for the decorative URL slug.
  - `formatTicketRef(prefix, number, title)` — builds the hash body: `PREFIX-N-slug` / `N-slug` (drops the trailing `-` when the title has no slug).
  - `parseTicketRef(ref)` — extracts the integer, tolerating an optional `PREFIX-` and a trailing `-slug`; returns null when there's no number.
- **`apps/web/lib/use-boards.ts`** — replaced the `#board/<id>/card/<id>` (uuid) hash router with ticket-centric routing:
  - `useSelectedBoard()` now derives the single board from the boards list (not the URL); `select` is a retained no-op (nothing to switch).
  - `useSelectedCard()` maps the hash integer ↔ card id: it resolves the hash number to a card id over the live card list (`useAllCards`), and its setter serializes a card id back to `PREFIX-N-slug` via `getCard`/`getBoard`/`formatTicketRef`.
  - `useOpenCardNav()` (search/palette) writes the same ticket hash.
  - `useHashTicketNumber()` parses the hash reactively (hashchange).
  - `useEnsureBoard()` simplified — selection is now automatic, so it only provisions when empty (no more hash writes).
- **`apps/web/components/command-palette/palette.tsx`** — removed the "Create board" action and the "Jump to board" group (single-board); kept the new-card action and card search.

## Why

- Product decision (user, R6): ticket links should read like Linear's `TEC-1234-some-description`.
- **Resolve by integer** so a stale prefix or an edited title in a shared URL still opens the right card (matches Linear). The card id stays a uuid internally — only the hash representation changed — so `CardDetail`, keyboard focus restore, search, and palette keep working unchanged.
- Board is implicit because Boardly is single-board (Unit 6.2); dropping the `board/<id>` segment is what makes the URL clean.

## How it works

`useSelectedCard` reads the hash → `parseTicketRef` → integer → finds the live card with that `number` → returns its uuid (or null). Its setter takes a uuid → `getCard` for `number`+`title`, `getBoard` for the prefix → `formatTicketRef` → writes the hash (or clears it for null). Everything downstream still deals in uuids.

## How to test / verify

- **Domain unit tests** (`packages/domain/src/ids.test.ts`, green): `slugify`, `formatTicketRef`, `parseTicketRef` — incl. stale-prefix resolution and no-slug/empty cases.
- **Routing round-trip** (`apps/web/lib/use-boards.test.tsx`, green — new): renders `useOpenCardNav` + `useSelectedCard` over a real memory-backed board and asserts:
  - opening card #1 writes `#1-fix-the-login-bug` (write path);
  - that hash resolves back to the same card id (read path);
  - `#OLD-1-something-else` still resolves to card 1 (integer-only, stale prefix/slug);
  - clearing resolves to no card and empties the hash.
- **Search integration** (`apps/web/components/search/search.test.tsx`, green): clicking a search result deep-links to `#1-auth-service`.
- **Palette** (`apps/web/components/command-palette/palette.test.tsx`, green): no board-create/jump commands; new-card action still works.
- Typecheck + lint + full web suite (147 tests) + static build: green. Pre-existing unrelated `@boardly/e2e` `focus-mode.spec.ts` DOM-lib errors remain.

Use the pinned Node 22 bin: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

### Browser verification note

Live browser checks this iteration were impeded by the dev session's accumulated multi-board data (from the shared `LOCAL_USER` local doc re-syncing to fresh accounts — see UNIT-6.2 known gaps) and add-card/add-column composers not responding in that reset-churned session. The routing logic is instead covered deterministically by the round-trip hook test and the search integration test above, which exercise the exact write/read paths against real board docs. The earlier UNIT-6.2 screenshots confirm the board + card faces render.

## Follow-ups / known gaps

- The `#TEC-N` (non-empty prefix) form can't be exercised in the UI until Unit 8 adds the prefix-editing settings; the empty-prefix `#N-slug` form is the current default and is fully covered.
- `useSelectedCard` calls `useAllCards(boardId ?? "")`; when no board is selected yet this touches an empty `board:` doc (benign). Harmless transient before provisioning completes.
- Board-switching UI is gone (single-board): `useSelectedBoard().select` is a no-op. If multi-board ever returns, routing must carry the board again.
