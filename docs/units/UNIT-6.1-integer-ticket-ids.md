# UNIT-6.1 — Integer ticket number + display-only board prefix

Part of plan `docs/plans/2026-07-11-002-feat-projects-ticket-ids-settings-plan.md` (Unit 1).

## What changed

The ticket identity moved from a **baked `shortId` string** (`BRD-142`, written once at card creation) to a **stored integer `number`** plus a **display-only board prefix** that derives the human-facing id at read time.

- **`packages/domain/src/ids.ts`**
  - Added `formatTicketId(prefix, number)` → `#{number}` when the prefix is empty, `{PREFIX}-{number}` when set.
  - Added `normalizeTicketPrefix(input)` → uppercase, strip to `[A-Z0-9]`, cap at 5 chars; empty is valid.
  - Added `repairTicketNumbers(cards)` + `TicketNumberCard` — the integer analogue of the old `repairShortIds`; deterministic collision repair-on-read keyed on `(createdAt, id)`.
  - Removed `repairShortIds` / `ShortIdCard` (superseded). Kept `formatShortId` / `parseShortId` as generic helpers (parsing is reused by Unit 3 routing).
- **`packages/domain/src/types.ts`** — `Card` gains `number: number` (stored) and documents `shortId` as derived/display-only. `Board.shortIdPrefix` documented as uppercase/≤5/may-be-empty.
- **`packages/sync/src/schema.ts`** — `cardToPlain(yc, opts?: { prefix?; number? })` now reads the stored `number` and derives `shortId = formatTicketId(prefix, number)`. `boardToPlain` defaults the prefix to `""` (was `"BRD"`).
- **`packages/sync/src/board-doc.ts`**
  - `initBoard` default prefix `""` (was `"BRD"`).
  - `addCard` stores `number = shortIdSeq + 1` (no longer bakes a `shortId` string).
  - Selectors (`cardsInColumn`, `getCard`, `allLiveCards`, `reclaimCards`) read the board prefix once + compute `ticketNumberOverrides` (repair-on-read) and pass both to `cardToPlain` via a small `toPlain` helper.
  - Snapshot: `buildCard` stores `number`; `maxTicketNumber` (was `maxShortIdSeq`) seeds `shortIdSeq` on import.
- **`packages/domain/src/io/snapshot.ts`** — `cardSchema` replaces `shortId` with `number: z.number().int().nonnegative().default(0)`; board `shortIdPrefix` default `""`.
- **`packages/domain/src/io/obsidian.ts`** — importer assigns `number: ++ticketNumber`; imported boards default to an empty prefix.
- Tests updated: `ids.test.ts`, `board-doc.test.ts`, `short-ids.test.ts`, `io.test.ts` (domain + sync), `catalog.test.ts` (commands), and the `Card` fixtures in `filters.test.ts`, `filter-builder.test.tsx`, `list-view.test.tsx`, plus display assertions in `card-detail.test.tsx` / `list-view.test.tsx` (`BRD-1` → `#1`).

## Why

- The user's revised design: the prefix is one **board-level** setting (not per-project), uppercase ≤5 chars, default empty; ids are integers like Linear.
- **Store the integer, derive the display id** so the ~10 existing `card.shortId` consumers (card face, drawer, list view, search, palette, io) keep working unchanged, and so **changing the prefix is safe and reversible** — it only re-renders labels, never renumbers. This is why the originally-requested "confirm, can't change later" lock is unnecessary (see plan Key Technical Decisions / Open Questions — flagged for user veto).
- No migration: per the user, resetting in-development data is acceptable, so the baked `shortId` string is simply dropped rather than back-filled.

## How it works

`shortIdSeq` on board meta is the single board-wide counter. `addCard` allocates `seq + 1` and stores it as the card's `number`. On read, each selector reads the board's `shortIdPrefix` and runs `repairTicketNumbers` over all cards (reassigning any duplicate numbers from concurrent offline creation, deterministically and without writing). `cardToPlain` then derives `shortId = formatTicketId(prefix, effectiveNumber)`. Empty prefix → `#42`; prefix `TEC` → `TEC-42`.

## How to test / verify

- Unit tests (all green): `pnpm --filter @boardly/domain test`, `pnpm --filter @boardly/sync test`, `pnpm --filter @boardly/commands test`, `pnpm --filter @boardly/web test`.
  - `ids.test.ts` — `formatTicketId`, `normalizeTicketPrefix`, `repairTicketNumbers`.
  - `board-doc.test.ts` — sequential `number` shown as `#1`/`#2`; `TEC-1` when a prefix is set; duplicate-number repair-on-read.
  - `short-ids.test.ts` — merged-collision repair converges across replicas.
  - `io.test.ts` — JSON/Obsidian snapshot round-trips `number`.
- Typecheck: all changed packages (`@boardly/domain`, `@boardly/sync`, `@boardly/commands`, `@boardly/web`) green. (Pre-existing unrelated failure in `@boardly/e2e` `focus-mode.spec.ts` — DOM lib config, not touched by this unit.)
- Lint + `@boardly/web` static build: green.
- Visible effect: the card face, card drawer, and list view render `#1`, `#2`, … — asserted by `card.test.tsx`, `card-detail.test.tsx`, and `list-view.test.tsx`, which render the real production components. A full-stack dark-mode screenshot is deferred to the UI-heavy units (4/7/8) that stand up the board anyway; there is no visual surface unique to this unit beyond the id text those tests already assert.

Use the pinned Node 22 bin for all commands: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

## Follow-ups / known gaps

- The board-level prefix has no editing UI yet — that arrives in Unit 8 (settings → General) via a `setTicketPrefix` command. Until then the prefix is empty (`#{number}`) unless a board is initialized with one.
- `formatShortId` / `parseShortId` remain exported for Unit 3's ticket-URL parsing.
- Pre-existing `@boardly/e2e` typecheck error (`getComputedStyle`/`document` in `focus-mode.spec.ts`) is unrelated and left as-is.
