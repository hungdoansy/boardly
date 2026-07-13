# UNIT-9.1 — Related tickets (untyped, symmetric)

Part of the board & card UX batch (`docs/plans/2026-07-13-001-feat-board-card-ux-batch-plan.md`, item 4).

## What changed

A card can now carry an untyped, **symmetric** set of related cards, managed from a new **Related**
section in the card drawer.

- **Domain** (`packages/domain/src/types.ts`): `Card` gains `relatedIds: Id[]` (sorted, stable).
- **Snapshot** (`packages/domain/src/io/snapshot.ts`): `cardSchema` gains
  `relatedIds: z.array(z.string()).default([])`, so JSON import/export round-trips relations and
  older files (without the field) default to `[]`.
- **Sync** (`packages/sync/src/schema.ts`, `board-doc.ts`):
  - `cardToPlain` reads a `related` Y.Map into `relatedIds` (keys, sorted).
  - `addCard` initializes an empty `related` Y.Map; `buildCard` (import) rebuilds it from
    `relatedIds`.
  - New `addRelation(doc, a, b, now)` / `removeRelation(doc, a, b, now)`: both write **both
    directions** in one transaction. `addRelation` is a no-op for a self-relation or a missing
    card; a lazily-created `relatedOf` helper tolerates cards persisted before this field existed.
- **Commands** (`packages/commands/src/commands/card.ts`, `catalog.ts`): `addRelatedCard` and
  `removeRelatedCard` (`{ cardId, relatedId }` → updated card), registered in the catalog so the
  REST/MCP agent surface gets them for free (R13 parity).
- **Web hooks** (`apps/web/lib/use-board.ts`): `useCardActions().addRelated` / `removeRelated`.
- **Web UI**:
  - `apps/web/components/card/related.tsx` — the Related section: related cards as rows (status
    glyph + mono `shortId` + title, each row opens that card via `useSelectedCard`), a hover
    remove `×`, and an "Add related" dashed pill opening a Popover that searches the board by
    `shortId`/title. The picker excludes self, already-related, and archived cards
    (`useAllCards` already omits archived).
  - `apps/web/components/card/card-detail.tsx` renders `<CardRelated>` in a new section directly
    after Links.

## Why

- **Symmetric, untyped** was the user's explicit choice (plan Q3) — simplest schema and UI, and
  either card's drawer shows the link with no read-time join.
- **Y.Map set** mirrors the existing `labels` field: merge-safe under Yjs (concurrent relate/
  unrelate converge) and consistent with the rest of the schema. Writing both directions in one
  transaction keeps the two sides atomically consistent.
- Placed **after Links** because relations are a "connections" concern like links; the section
  reuses the `CardLinks` row layout and the `labels` "add" affordance so it inherits approved
  design tokens.

## How it works

`relatedIds` is derived from the `related` Y.Map's keys at read time (sorted for stable render).
The drawer resolves those ids against `useAllCards()` to render rows; clicking a row calls the
hash-backed `useSelectedCard` setter, which swaps the open card inside the same drawer Sheet. The
add-picker filters `useAllCards()` by a case-insensitive `shortId`/title match, excluding self and
already-related ids (archived cards are already absent from `useAllCards`).

## How to test / verify

- **Unit tests (all green):**
  - `packages/sync/src/board-doc.test.ts` — symmetric relate/unrelate, self no-op, missing-card
    no-op, idempotency, and export→import round-trip of `relatedIds`.
  - `packages/commands/src/commands/card.test.ts` — `addRelatedCard`/`removeRelatedCard` via
    `execute`, asserting symmetry.
  - `packages/commands/src/catalog.test.ts` — both commands registered.
  - `apps/web/components/card/related.test.tsx` — add via picker renders a chip and creates a
    symmetric relation; remove clears it; picker excludes self/related/archived; clicking a chip
    writes the ticket hash (navigation).
  - `packages/domain/src/io/io.test.ts` — JSON round-trip now carries `relatedIds`.
- **DoD run (Node 22.17.1):** `typecheck` clean (all packages except the pre-existing
  `@boardly/e2e` DOM-lib break in `focus-mode.spec.ts`, unrelated to this unit); `lint` clean;
  `vitest run` = 402 passed / 37 skipped; `@boardly/web build` (static export) compiles.

## Follow-ups / known gaps

- **Dark-mode screenshot pending:** no web dev server was running in this session (only the Docker
  prod stack on :8788/:5433), so the automated Playwright dark-mode capture of the Related section
  was not run. Behavior is covered by the component tests and the section reuses the
  already-approved `CardLinks`/`labels` visual patterns. Run the dark-mode check when the dev stack
  is up (seed demo account, open a card, add a relation) before considering the visual signed off.
- Hard-deleting a card must strip inbound relations — handled in **UNIT-9.2** (depends on this unit).
