---
title: "feat: Board & card UX batch (links, delete, related, urgent, filter-aware create)"
type: feat
status: active
date: 2026-07-13
---

# feat: Board & card UX batch

## Overview

A batch of eight targeted board/card improvements requested from live use of Boardly. They
span three layers — the framework-agnostic `@boardly/domain` model, the `@boardly/sync` Yjs
accessors + `@boardly/commands` command layer, and the `apps/web` React UI (which also runs
inside the Tauri desktop shell). Each item is small-to-medium; they are grouped into one plan
because several touch the same files (card detail drawer, `board-doc.ts` card selectors, the
link renderer) and share conventions (fractional `ord`, the command layer, Y.Map "set" fields
like `labels`).

The eight items (user's original numbering preserved; 2 and 5 were intentionally skipped):

1. **Links don't open** — clicking a link in the card drawer's Links section does nothing.
3. **Delete button** — a hard delete (removes the card from the doc), distinct from Archive.
4. **Related tickets** — link a card to other cards (untyped, symmetric).
6. **Filter-aware create** — adding a card while a filter is active seeds the card to match it.
7. **Urgent floats up** — setting a card to Urgent moves it to the top of its column (once).
8. **Empty-column hiding honors filters** — a column emptied by the active filter also hides.
9. **Whole-card click** — clicking anywhere on a card face opens it, not just the title.
10. **Slack link label** — drop the deep-link arrow; show the workspace name instead of "msg".

## Problem Frame

Boardly is a personal, single-user, local-first kanban (see `PLAN.md`, `MEMORY.md`). There is
no upstream requirements doc for this batch — the input is the user's punch-list from daily use.
Each item is a concrete friction point:

- On the **desktop** build, external links are dead: the Tauri v2 webview does not open
  `target="_blank"` anchors in the OS browser without the opener plugin (the same pattern the app
  already uses for notifications via `@tauri-apps/plugin-notification`). On web the anchor works;
  the fix must not regress web (cmd/middle-click, new tab).
- "Archive" and "delete" were **conflated**: `archiveCard` in `packages/sync/src/board-doc.ts`
  sets *both* `archived: true` and `deletedAt`, and there is no restore UI. The user wants a true
  **hard delete** ("no longer in the database") behind a confirm dialog, with **Archive left
  intact** (card stays in the doc; an Archive browsing view is future work the user will build).
- Urgent cards get buried at the bottom of a column (new cards append via `maxOrd`), so the user
  wants an Urgent card to jump to the top **once** when it becomes Urgent.
- The hide-empty-columns toggle counts *unfiltered* cards (`useCardCounts`), so a filter that
  empties a column still leaves an empty column on screen.
- Only the card title is clickable to open the drawer; the rest of the card face is dead space.
- Slack message links render as `msg →` with an up-arrow affordance and no useful context; the
  user wants the **workspace name** (derivable from the subdomain) and no arrow.
- New cards don't inherit the active filter's implied fields (e.g. filtering to a project, then
  adding a card, should put the card in that project). The sidebar project scope already does
  this for `projectId`; the filter should extend it.

## Requirements Trace

- **R1** — Clicking a link in the card drawer opens it in the OS browser on desktop and a new
  tab on web (item 1).
- **R3** — A Delete action hard-removes a card from the board doc after explicit confirmation,
  and is visibly distinct from Archive (item 3).
- **R4** — A card can be linked to other cards; the relationship is untyped and symmetric
  (linking A→B shows the link on both); links are removable; clicking one opens that card (item 4).
- **R6** — Creating a card while a filter is active seeds the new card's settable fields
  (project, priority, labels) from the filter so it satisfies the filter (item 6).
- **R7** — Setting a card's priority to Urgent moves it to the top of its status column once;
  it remains freely draggable afterward (item 7).
- **R8** — When "hide empty columns" is on and a filter is active, a column with zero *matching*
  cards is hidden (item 8).
- **R9** — Clicking anywhere on a card face opens its detail drawer, without breaking drag
  (item 9).
- **R10** — Slack links show the workspace name (or "Slack" when it can't be derived) and no
  deep-link arrow (item 10).

## Scope Boundaries

- **Non-goal:** an Archive/Trash browsing or restore view — the user is building the Archive view
  separately. This plan only adds hard **Delete**; Archive behavior is unchanged (see
  "Unchanged invariants").
- **Non-goal:** typed relations (blocks / blocked-by). Related is a single untyped symmetric list.
- **Non-goal:** removing the deep-link arrow for non-Slack providers (e.g. Claude's `session →`).
  Item 10 is scoped to Slack; the general arrow affordance stays. See Deferred.
- **Non-goal:** an undo/toast primitive — the chosen Delete model uses a confirm dialog, not undo.
- **Non-goal:** changing drag-and-drop reordering, the fractional-`ord` model, or the list/
  swimlane layouts beyond what items 7/8/9 strictly require.

### Deferred to Separate Tasks

- Archive browsing + restore view — user-owned, future.
- Dropping the deep-link arrow for other providers (Claude `session →`, etc.) — revisit if the
  Slack change reads well.
- Purging orphaned activity-log entries for hard-deleted cards — see Risks; deferred as cosmetic.

## Context & Research

### Relevant Code and Patterns

- **Card model:** `packages/domain/src/types.ts` — `Card` already has `archived: boolean` and
  `deletedAt?: number`. Add `relatedIds: Id[]` here (item 4). Priority enum in
  `packages/domain/src/enums.ts` (`Priority.Urgent === 4`).
- **Yjs accessors / selectors:** `packages/sync/src/board-doc.ts` — `addCard`, `setCardPriority`,
  `archiveCard`, `moveCard`, `cardsInStatus`, `allLiveCards`, `getCard`, `deleteLabel` (the
  pattern for stripping an id from every card's `labels` set — mirror it for related-cleanup on
  delete), `maxOrd`, `keyBetween`. Y.Map "set" fields (`labels`, `checklist`, `links`) are the
  template for a new `related` set.
- **Plain serialization:** `packages/sync/src/schema.ts` `cardToPlain` — reads `deletedAt`,
  `labels`, etc. into the plain `Card`; add `related` → `relatedIds` here.
- **Command layer:** `packages/commands/src/commands/card.ts` — `createCard`, `setCardPriority`,
  `archiveCard`, `getCard`. New: `deleteCard`, `addRelatedCard`, `removeRelatedCard`; extend
  `createCard` (priority + labelIds) and `setCardPriority` (pass clientId for the float). Register
  new commands in `packages/commands/src/catalog.ts` (verify — `catalog.test.ts` guards the set).
- **React↔Yjs binding:** `apps/web/lib/use-board.ts` — `useCardActions`, `useLinkActions`,
  `useCardById`, `useCardsInStatus`, `useAllCards`, `useCardCounts`. Card actions call
  `execute(command, ctx, input)`.
- **Card detail drawer:** `apps/web/components/card/card-detail.tsx` — section order is
  Description → Properties → Links → Checklist → Labels → Activity; footer has the Archive
  button. Add the Delete button (footer) and a Related section.
- **Links renderer:** `apps/web/components/card/links.tsx` — the `<a href={isSafeHttpUrl(...) ?
  url : "#"} target="_blank">` and the `ArrowUpRight` shown when `isDeepLink`. `link-cluster.tsx`
  is the display-only card-face cluster.
- **Link providers:** `packages/domain/src/links/providers/slack.ts` (item 10);
  `packages/domain/src/links/registry.ts` — `linkLabel`/`linkSubtitle`/`stripDeepLinkMarker`/
  `isSafeHttpUrl`.
- **Card face:** `apps/web/components/card/card.tsx` (`CardFace`) — only the title is a button;
  wrapped by `SortableCard` in `apps/web/components/board/dnd.tsx` (dnd-kit `PointerSensor`,
  `activationConstraint: { distance: 5 }` — a click that doesn't move ≥5px never starts a drag,
  which is what makes item 9 safe).
- **Board view + counts:** `apps/web/components/board/board-view.tsx` — `visibleStatuses`
  derives from `useCardCounts` (unfiltered); `ColumnCards` already filters per status with
  `evaluateFilter`. `apps/web/components/board/column-cards.tsx`, `swimlanes.tsx`, `list-view.tsx`.
- **Filter model:** `packages/domain/src/filters.ts` — `Filter`/`FilterGroup`/`FilterClause`,
  `evaluateFilter`, `FilterContext`. `apps/web/components/app/workspace-app.tsx` composes
  `effectiveFilter` (sidebar project scope ANDed with the view filter) and threads it to
  `BoardView`/`ListView`.
- **Desktop shell:** `apps/desktop/src-tauri/src/main.rs` (plugin registration),
  `Cargo.toml` (Rust plugin deps), `capabilities/default.json` (permission grants),
  `apps/web/package.json` (JS `@tauri-apps/plugin-*` deps, dynamically imported — see
  `apps/web/lib/notify.ts` for the exact pattern). `apps/web/lib/platform.ts` `isTauri()`.

### Institutional Learnings

- `docs/solutions/` — none found relevant to these items (searched; directory-level guidance in
  `CLAUDE.md`/`PLAN.md` is the governing source instead).
- **Repo rules (`CLAUDE.md`):** all mutations go through the command layer (never mutate Yjs from
  components); icons are `lucide-react` SVGs, never glyphs; exact-version deps; dark mode first;
  each unit gets a `docs/units/UNIT-*.md` doc committed by the time its checkbox is ticked; Node
  22.17.1 via `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"` prefix for all
  install/build/test commands.
- **Memory:** `boardly-board-collapse` — the board is 8 fixed Linear statuses; a card's column IS
  its `status`; `showEmptyColumns` toggle exists. `boardly-e2e-verification` — run Playwright
  against an already-running dev server via a no-webServer scratch config.

### External References

- Tauri v2 opener plugin (`@tauri-apps/plugin-opener` / `tauri-plugin-opener`): the supported way
  to open a URL in the OS default browser from a v2 webview; requires the JS package, the Rust
  crate, `.plugin(tauri_plugin_opener::init())` in `main.rs`, and an `opener:allow-open-url`
  capability grant. (Confirm the exact pinned versions at install against the app's Tauri
  `2.x` line — `@tauri-apps/api` is `2.11.1`, CLI `2.9.2`.) Not skipping external verification
  here because the desktop link layer is thin in the repo (only notification/http/deep-link
  plugins are wired today — no opener precedent).

## Key Technical Decisions

- **Delete is a hard delete** (`boardCards(doc).delete(cardId)`), gated by a confirm `Dialog`,
  and issued through a new `deleteCard` command. Archive is left exactly as-is (still
  `archived: true` + `deletedAt`, still no restore UI) so the user's future Archive view can rely
  on unchanged semantics. Rationale: the user explicitly defined delete as "no longer in the
  database" and archive as "still in the database." This avoids building a trash/undo primitive.
- **Related is a per-card Y.Map "set"** (`related: Y.Map<id, true>`), mirroring `labels`, and is
  kept **symmetric** by writing both directions in `addRelation`/`removeRelation`. Rationale:
  matches the existing merge-safe set pattern; symmetric writes mean either card's drawer shows
  the link with no read-time join. Plain shape is `relatedIds: Id[]` (sorted for stable render).
- **`deleteCard` strips the deleted id from every other card's `related` set** in the same
  transaction (mirroring `deleteLabel`'s cross-card cleanup). Rationale: prevents dangling
  related-refs; this is why item 4 sequences before item 3.
- **Urgent float is a one-time `ord` re-slot on the non-urgent→urgent transition**, done inside
  the sync `setCardPriority` (extended to take `clientId`) so *every* caller — drawer
  `PrioritySelect`, the board's keyboard priority-cycle, and the agent command — gets it. The
  card is placed before the current first card of its status via `keyBetween(null, firstOrd,
  clientId)`. Rationale: the user chose "move once when set"; putting it in the shared mutation
  keeps behavior consistent and avoids a display-time sort that would fight drag-and-drop.
- **Desktop link opening uses a platform-aware `openExternal(url)`** that dynamically imports
  `@tauri-apps/plugin-opener` under `isTauri()` and falls back to
  `window.open(url, "_blank", "noopener,noreferrer")` on web. The link `<a>` keeps its `href`;
  its `onClick` only intercepts (`preventDefault` + `openExternal`) when `isTauri()`, so web
  keeps native anchor behavior (cmd/middle-click, new tab). Rationale: same dynamic-import,
  never-throw pattern as `apps/web/lib/notify.ts`.
- **Whole-card open is an `onClick` on the `CardFace` root**, relying on dnd-kit's 5px activation
  distance to distinguish click from drag; the redundant inner title `<button>` collapses to a
  span. Keyboard open (Enter) stays on the focusable `SortableCard` wrapper (`keyboard-nav`).
- **Slack `shortLabel` derives the workspace from the subdomain** (`<ws>.slack.com` → title-cased
  `ws`; `app.slack.com`/bare `slack.com` → `"Slack"`) and no longer appends the `" →"` deep-link
  marker, which removes the arrow for Slack while leaving the marker mechanism intact for other
  providers.
- **Filter-derived card defaults** come from a pure domain helper `deriveCardDefaults(filter)`
  that walks only the **top-level AND group** and extracts single-value `is` equality clauses for
  `project` → `projectId`, `priority` → `priority`, and `label` → `labelIds` (collecting all
  `label is` clauses). OR groups, `isNot`, ranges, and nested groups are ignored (ambiguous).
  Rationale: a filter is arbitrary; only unambiguous equalities can seed a card. This subsumes the
  current sidebar-project seeding because `effectiveFilter` already ANDs the sidebar scope in.
- **Empty-column visibility uses filtered per-status counts** computed in `board-view.tsx` from
  `useAllCards()` + `evaluateFilter` (grouped by status), replacing the unfiltered `useCardCounts`
  for both the hide-empty decision and the column header count. Rationale: one derivation, always
  consistent with what `ColumnCards` actually renders.

## Open Questions

### Resolved During Planning

- Delete vs archive semantics → **hard delete + confirm; archive unchanged** (user).
- Urgent-to-top behavior → **move once when set Urgent** (user).
- Related shape → **untyped, symmetric** (user).
- Is item 1 web or desktop? → Primarily **desktop** (Tauri webview blocks `target="_blank"`);
  the fix also hardens web via one helper without regressing native anchor behavior.
- Where do filter defaults come from vs the sidebar scope? → From the **effective filter**, which
  already includes the sidebar project clause; no separate precedence rule needed.

### Deferred to Implementation

- Exact pinned versions of `@tauri-apps/plugin-opener` / `tauri-plugin-opener` (resolve at install
  against the app's Tauri 2.x line; record in the unit doc).
- Where precisely the **Related** section sits in the drawer (after Links is the plan's intent;
  confirm visually against `DESIGN.md` density during implementation).
- The card-search affordance for adding a relation (inline combobox vs. popover) — pick the
  lightest shadcn/Radix composition that fits; behavior (search by shortId/title, exclude self +
  already-related + archived) is fixed here.
- Whether the Urgent float should also fire on `moveCard`/drag into a column while already Urgent
  (plan: no — float is tied to the priority *transition* only).

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not
> implementation specification. The implementing agent should treat it as context, not code to
> reproduce.*

Layering (each item touches a subset, bottom-up):

```
domain (types, filters, links)   ── relatedIds, deriveCardDefaults, slack label
        │
sync (board-doc, schema)         ── deleteCard, add/removeRelation, priority-float, related serialize
        │
commands (card.ts, catalog)      ── deleteCard, addRelatedCard, removeRelatedCard, createCard+, setCardPriority(clientId)
        │
web (use-board hooks)            ── delete/related actions, filtered counts, defaults threading
        │
web UI (card-detail, card, links, board-view, column-cards)
        │
desktop (Tauri opener plugin)    ── openExternal, capability grant
```

Symmetric relation write (item 4) — both directions in one transaction:

```
addRelation(doc, A, B):
  transact:
    cardA.related.set(B, true)
    cardB.related.set(A, true)    # symmetry, no read-time join needed
deleteCard(doc, X):
  transact:
    for each card C != X: C.related.delete(X)   # mirror deleteLabel cleanup
    boardCards.delete(X)                          # hard delete
```

Urgent float (item 7) — one-time re-slot inside the shared mutation:

```
setCardPriority(doc, id, p, now, clientId):
  from = card.priority
  card.priority = p
  if p == Urgent and from != Urgent:
     firstOrd = min ord among live cards in card.status (excluding this card)
     card.ord = keyBetween(null, firstOrd, clientId)   # top of the column
```

## Implementation Units

- [x] **Unit 1 (UNIT-9.1): Related tickets — model, sync, commands, and drawer UI**

**Goal:** A card carries an untyped, symmetric set of related card ids — mutated through the
command layer, merge-safe under Yjs, and managed from a Related section in the card drawer where
each related ticket is a chip that opens that card.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Modify: `packages/domain/src/types.ts` (add `relatedIds: Id[]` to `Card`)
- Modify: `packages/sync/src/schema.ts` (`cardToPlain` reads `related` Y.Map → sorted `relatedIds`)
- Modify: `packages/sync/src/board-doc.ts` (`addCard` inits `related` map; `addRelation`,
  `removeRelation`; export)
- Modify: `packages/commands/src/commands/card.ts` (`addRelatedCard`, `removeRelatedCard`)
- Modify: `packages/commands/src/catalog.ts` (register new commands)
- Modify: `packages/domain/src/io/snapshot.ts` + `packages/sync/src/board-doc.ts` `buildCard`/
  `boardToSnapshot` (round-trip `relatedIds`) — verify snapshot type `SnapshotCard`
- Modify: `apps/web/lib/use-board.ts` (`useCardActions().addRelated`/`removeRelated`, or a
  `useRelatedActions` hook)
- Create: `apps/web/components/card/related.tsx` (drawer Related section: chips + add-picker)
- Modify: `apps/web/components/card/card-detail.tsx` (render `<CardRelated card={card} />`,
  placed after Links)
- Test: `packages/sync/src/board-doc.test.ts` (or the existing card sync test file), extend
  `packages/commands/src/commands/card.test.ts`, `packages/commands/src/catalog.test.ts`,
  `apps/web/components/card/related.test.tsx`

**Approach:**
- **Model/sync:** store as `related: Y.Map<string, true>` per card (mirror `labels`); `cardToPlain`
  returns `relatedIds` sorted (stable render). `addRelation(doc, a, b, now)` writes both `a→b` and
  `b→a` in one transaction, no-op if `a===b` or either card missing; `removeRelation` deletes both.
- **Commands:** `{ cardId, relatedId }`; return the updated card (`syncGetCard`).
- **UI:** the Related section derives the related cards from `card.relatedIds` mapped over
  `useAllCards()` (id → `{ shortId, title, status }`); renders each as a removable chip. An add
  control searches cards by `shortId`/title, **excluding** self, already-related, and archived
  cards. Clicking a chip navigates via `useSelectedCard()`'s setter (hash-backed; keyed by ticket
  number) — no prop-drilling. Keep export round-trip lossless (snapshot carries `relatedIds`).

**Patterns to follow:** `assignLabel`/`unassignLabel` + the `labels` Y.Map in `board-doc.ts`;
`deleteLabel` cross-card iteration; command shape in `card.ts`; `CardLabels`/`CardLinks` section
structure in `apps/web/components/card/`; `useSelectedCard` in `apps/web/lib/use-boards.ts`.

**Test scenarios:**
- Happy path: `addRelation(A,B)` → `getCard(A).relatedIds` contains B **and** `getCard(B)` contains A.
- Happy path: `removeRelation(A,B)` → neither card lists the other.
- Edge case: `addRelation(A,A)` is a no-op (no self-relation).
- Edge case: relating to a missing/unknown card id is a no-op (no throw, no partial write).
- Edge case: adding the same relation twice is idempotent (set semantics; one entry each side).
- Integration: JSON export → import round-trips `relatedIds` unchanged.
- Integration: `catalog.test.ts` includes `addRelatedCard`/`removeRelatedCard` with valid schemas.
- UI happy path: adding a card via the picker renders a chip; removing it clears the chip.
- UI edge case: the add-picker excludes self, already-related, and archived cards from results.
- UI integration: clicking a related chip calls the `useSelectedCard` setter with that card's id.

**Verification:** New sync + command + UI tests pass; a related pair shows symmetrically via
`getCard` and in both cards' drawers; clicking a chip opens that card; snapshot round-trip
preserves relations; dark-mode screenshot of the Related section; typecheck/lint/build green.

- [x] **Unit 2 (UNIT-9.2): Hard delete card — sync, command, drawer UI**

**Goal:** A Delete action permanently removes a card from the board doc after confirmation,
cleaning up inbound related-refs; Archive is untouched.

**Requirements:** R3

**Dependencies:** Unit 1 (for symmetric related-ref cleanup on delete)

**Files:**
- Modify: `packages/sync/src/board-doc.ts` (`deleteCard(doc, cardId, now)`: strip `cardId` from
  every other card's `related` set, then `boardCards(doc).delete(cardId)`; export)
- Modify: `packages/commands/src/commands/card.ts` (`deleteCard` command)
- Modify: `packages/commands/src/catalog.ts` (register)
- Modify: `apps/web/lib/use-board.ts` (`useCardActions().delete`)
- Modify: `apps/web/components/card/card-detail.tsx` (Delete button in footer beside Archive;
  confirm `Dialog`; on confirm → delete + `onClose`)
- Test: `packages/sync/src/board-doc.test.ts`, `packages/commands/src/commands/card.test.ts`,
  `apps/web/components/card/card-detail.test.tsx`

**Approach:**
- Hard delete: `boardCards(doc).delete(cardId)` inside a transaction; first iterate all cards and
  `related.delete(cardId)` (mirror `deleteLabel`). Do **not** touch archive.
- UI: a `Trash2` (lucide) ghost button styled with `var(--danger)` in the footer, opening a
  shadcn `Dialog` ("Delete this card? This can't be undone."), Cancel + Delete. Archive stays.
- Command returns `{ id, deleted: true }` (analogous to `archiveCard`'s return).

**Patterns to follow:** `archiveCard` command + footer button in `card-detail.tsx`; `deleteLabel`
cross-card cleanup; existing `Dialog` usage in `card-composer.tsx`.

**Test scenarios:**
- Happy path: `deleteCard(A)` → `getCard(A)` is `null`; A no longer appears in `cardsInStatus`/
  `allLiveCards`.
- Integration: relate A↔B, then `deleteCard(A)` → `getCard(B).relatedIds` no longer includes A
  (no dangling ref).
- Edge case: deleting an unknown id is a no-op (no throw).
- Error path (UI): opening the confirm dialog and cancelling does **not** delete; confirming
  calls `delete` and closes the drawer.
- Regression: `archiveCard` still only archives (card remains fetchable? — note: archived cards
  are excluded from selectors but the doc entry remains; assert the card map still has the key
  after archive, and is gone after delete).

**Verification:** Deleted card is absent from all selectors and `getCard`; related peers cleaned;
Archive behavior unchanged; confirm-dialog gating works; dark-mode screenshot of the footer with
both Archive and Delete; tests green.

- [x] **Unit 3 (UNIT-9.3): Urgent floats to top on set**

**Goal:** Transitioning a card to Urgent moves it to the top of its status column exactly once;
it remains normally draggable afterward.

**Requirements:** R7

**Dependencies:** None

**Files:**
- Modify: `packages/sync/src/board-doc.ts` (`setCardPriority` gains a `clientId` param; on
  non-urgent→urgent transition, re-slot `ord` to before the current first card of its status.
  `addCard` also slots at the top when created with `priority === Urgent` instead of appending)
- Modify: `packages/commands/src/commands/card.ts` (`setCardPriority` passes `ctx.clientId`)
- Test: `packages/sync/src/board-doc.test.ts`, `packages/commands/src/commands/card.test.ts`

**Approach:**
- Extract a small helper `topOrdOfStatus(doc, status, clientId, excludeId?)` = `keyBetween(null,
  minOrd, clientId)` where `minOrd` is the smallest `ord` among live cards in that status
  (excluding `excludeId`).
- `setCardPriority`: set the priority, then when `from !== Urgent && to === Urgent`, set
  `card.ord = topOrdOfStatus(...)`. No reorder otherwise. Single transaction so the drawer picker,
  the board keyboard cycle (`board-view.tsx` `cyclePriority`), and the agent command all inherit it.
- `addCard`: currently appends via `maxOrd` (bottom). When `params.priority === Urgent`, place at
  the **top** instead — so a filter-seeded Urgent card (Unit 5) lands at the top too, keeping the
  "urgent → top" invariant consistent between create and transition. (Requires `addCard` to accept
  `priority`, which Unit 5 also adds; whichever unit lands first introduces the param.)

**Patterns to follow:** `moveCard`'s `keyBetween(afterOrd, beforeOrd, clientId)`; `maxOrd`/`ord`
helpers; the existing activity append in `setCardPriority`.

**Test scenarios:**
- Happy path: column has [C1, C2, C3] by ord; set C3 → Urgent → order becomes [C3, C1, C2].
- Happy path: `addCard` with `priority: Urgent` into a non-empty column → new card is first.
- Edge case: setting an already-Urgent card's priority to Urgent again does not reorder.
- Edge case: setting a card to High/Medium/Low/None never reorders.
- Edge case: only card in its column → set Urgent → still sole card, no crash (firstOrd null).
- Integration: two cards set Urgent in sequence → the most-recently-set sits at the very top.
- Regression: priority activity-log entry still appended on change; non-Urgent `addCard` still
  appends at the bottom.

**Verification:** Sync/command tests prove the one-time re-slot and the no-ops; manual: cycle a
mid-column card to Urgent (keyboard `p`/drawer) and watch it jump to top; tests green.

- [ ] **Unit 4 (UNIT-9.4): Desktop opens external links (Tauri opener)**

**Goal:** Clicking a link in the drawer opens the OS browser on desktop and a new tab on web.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `apps/web/package.json` (add `@tauri-apps/plugin-opener`, exact version)
- Modify: `apps/desktop/src-tauri/Cargo.toml` (add `tauri-plugin-opener = "2"`)
- Modify: `apps/desktop/src-tauri/src/main.rs` (`.plugin(tauri_plugin_opener::init())`)
- Modify: `apps/desktop/src-tauri/capabilities/default.json` (add `opener:allow-open-url`)
- Create: `apps/web/lib/open-external.ts` (`openExternal(url)` — Tauri opener vs `window.open`)
- Modify: `apps/web/components/card/links.tsx` (intercept `onClick` only under `isTauri()`)
- Test: `apps/web/lib/open-external.test.ts`, extend `apps/web/components/card/links.test.tsx`

**Approach:**
- `openExternal(url)`: bail unless `isSafeHttpUrl(url)`; if `isTauri()` dynamically import
  `@tauri-apps/plugin-opener` and call `openUrl(url)` (never throw — try/catch like `notify.ts`);
  else `window.open(url, "_blank", "noopener,noreferrer")`.
- In `links.tsx`, keep the `<a href … target="_blank" rel="noreferrer">`; add
  `onClick={(e) => { if (isTauri()) { e.preventDefault(); void openExternal(link.url); } }}` so
  web is untouched and desktop is fixed.

**Patterns to follow:** `apps/web/lib/notify.ts` (dynamic `@tauri-apps/plugin-*` import + isTauri
branch + never-throw); the existing capability entries in `capabilities/default.json`.

**Test scenarios:**
- Happy path (web, mocked non-Tauri): `openExternal("https://x.com")` calls
  `window.open` with `_blank`/`noopener`.
- Happy path (desktop, mocked `isTauri` + opener module): calls the opener `openUrl`.
- Edge case: non-http URL (`javascript:…`, `slack://…`) → `openExternal` does nothing.
- Error path: opener import/throw is swallowed (no unhandled rejection).
- Integration (links.tsx, non-Tauri): anchor retains `href` and does not `preventDefault`
  (native new-tab preserved).

**Verification:** Vitest for the helper + links interception; **manual on desktop build**: a
drawer link opens the system browser (Rust changes require rebuilding the Tauri app — note in the
unit doc); web still opens a new tab and supports cmd/middle-click.

- [ ] **Unit 5 (UNIT-9.5): Filter-aware card creation**

**Goal:** Adding a card while a filter is active seeds its project, priority, and labels from the
filter so the new card satisfies the filter and stays visible.

**Requirements:** R6

**Dependencies:** None (independent; complements the existing sidebar-project seeding)

**Files:**
- Create/modify: `packages/domain/src/filters.ts` (`deriveCardDefaults(filter): { projectId?,
  priority?, labelIds? }`) + export from `packages/domain/src/index.ts`
- Modify: `packages/commands/src/commands/card.ts` (`createCard` input accepts optional
  `priority`, `labelIds`)
- Modify: `packages/sync/src/board-doc.ts` (`addCard` sets `priority`/`labels` when provided)
- Modify: `apps/web/lib/use-board.ts` (`useCardActions().create` accepts a `defaults` arg)
- Modify: `apps/web/components/board/column-cards.tsx` + `apps/web/components/board/swimlanes.tsx`
  (derive defaults from the active `filter`, pass to `create`)
- Test: `packages/domain/src/filters.test.ts`, `packages/commands/src/commands/card.test.ts`

**Approach:**
- `deriveCardDefaults` walks only the **top-level AND** group; for each direct `FilterClause`
  with `condition === "is"`: `project` (single value) → `projectId`; `priority` (single value) →
  `priority`; `label` → accumulate into `labelIds`. Ignore OR groups, nested groups, `isNot`,
  ranges, `isWithin`, `title`, `assignee`. Status is set by the column, not the filter.
- Thread the derived defaults into `create`; the sidebar project scope already lives inside
  `effectiveFilter`, so project seeding remains correct with one code path.

**Patterns to follow:** `evaluateFilter`/`matchesClause` traversal in `filters.ts`; the existing
`getSelectedProject()` seeding in `useCardActions().create`.

**Test scenarios:**
- Happy path: filter `project is P` → `deriveCardDefaults` returns `{ projectId: P }`; created
  card belongs to P.
- Happy path: filter `priority is Urgent` AND `label hasAny L` → defaults `{ priority: Urgent,
  labelIds: [L] }` (interacts with Unit 3 — `addCard` slots an Urgent-seeded card at the column
  top; assert the created card is first in its status).
- Edge case: OR-group filter → no defaults derived (`{}`).
- Edge case: `priority isNot High` / `dueDate isWithin week` / `title contains x` → ignored.
- Edge case: multiple `label is/hasAny` clauses → union of label ids.
- Edge case: empty/absent filter → `{}` (card created with plain defaults).
- Integration: `createCard` with `priority` + `labelIds` persists both (via `getCard`).

**Verification:** Domain unit tests for the extractor across clause shapes; command test for the
extended `createCard`; manual: filter to a project + priority, add a card, confirm it appears with
those fields; tests green.

- [ ] **Unit 6 (UNIT-9.6): Empty-column hiding honors the active filter**

**Goal:** With "hide empty columns" on and a filter active, a column with zero matching cards is
hidden; the column header count reflects the filtered set.

**Requirements:** R8

**Dependencies:** None

**Files:**
- Modify: `apps/web/components/board/board-view.tsx` (compute filtered per-status counts from
  `useAllCards()` + `evaluateFilter`; use them for `visibleStatuses` and the `count` prop)
- Modify (if needed): `apps/web/lib/use-board.ts` (optional `useFilteredCardCounts` hook, or keep
  the derivation inline in `board-view`)
- Test: `apps/web/components/board/board-view.test.tsx` (create if absent) or extend
  `apps/web/components/board/column.test.tsx`

**Approach:**
- In `board-view.tsx`, derive `counts: Record<Status, number>` by filtering `useAllCards()` with
  the active `filter`/`filterCtx` and tallying by status (memoized). Feed the same counts to the
  hide-empty filter and `StatusColumn count`. When no filter is active this equals the current
  unfiltered counts, so unfiltered behavior is unchanged.

**Patterns to follow:** the existing `useMemo` filter in `column-cards.tsx`
(`evaluateFilter(c, filter, filterCtx)`); `useAllCards()`/`STATUS_ORDER` usage.

**Test scenarios:**
- Happy path: two statuses have cards; a filter matches cards only in status A; hide-empty on →
  only status A's column renders.
- Edge case: filter matches nothing → all columns hidden when hide-empty on (empty board state).
- Edge case: hide-empty **off** + filter active → all columns still shown (toggle governs
  visibility; filter only governs counts).
- Regression: no filter → visibility + counts identical to today.

**Verification:** Component test asserting `visibleStatuses` responds to the filter; manual:
filter to one project, toggle hide-empty, watch non-matching columns disappear; tests green.

- [ ] **Unit 7 (UNIT-9.7): Whole-card click opens the drawer**

**Goal:** Clicking anywhere on a card face opens its detail drawer, without breaking drag or
keyboard open.

**Requirements:** R9

**Dependencies:** None

**Files:**
- Modify: `apps/web/components/card/card.tsx` (`onClick={onOpen}` on the `CardFace` root; collapse
  the inner title `<button>` to a span; `cursor-pointer`)
- Test: `apps/web/components/card/card.test.tsx`

**Approach:**
- Put `onClick={onOpen}` on the `<article>` root; add `role="button"`-appropriate semantics
  without stealing focus from the draggable wrapper (the `SortableCard` div in `dnd.tsx` remains
  the roving-focus target and handles Enter via `keyboard-nav`). dnd-kit's 5px activation distance
  means a plain click still fires `onClick` while a drag (>5px) suppresses it.

**Patterns to follow:** current title-button `onClick={onOpen}`; the `SortableCard` wrapper +
`data-nav="card"` focus model in `dnd.tsx`/`keyboard-nav.tsx`.

**Test scenarios:**
- Happy path: clicking the card body (not the title) fires `onOpen`.
- Happy path: clicking the title still fires `onOpen` (single handler now).
- Regression: card face has no other interactive controls that a root click would hijack (audit:
  status badge, labels, priority, link cluster, project chip are display-only).
- Integration (manual): a drag (pointer move >5px) reorders and does **not** open the drawer.

**Verification:** `card.test.tsx` asserts a body click opens; manual drag on the board still
reorders without opening; keyboard Enter still opens; tests green.

- [ ] **Unit 8 (UNIT-9.8): Slack link shows workspace name, no arrow**

**Goal:** Slack links display the workspace name (or "Slack" when it can't be derived) and drop
the deep-link arrow.

**Requirements:** R10

**Dependencies:** None

**Files:**
- Modify: `packages/domain/src/links/providers/slack.ts` (`shortLabel` → workspace from
  subdomain; no `" →"` marker)
- Test: `packages/domain/src/links/registry.test.ts` (Slack cases) + adjust any
  `apps/web/components/card/links.test.tsx`/`link-cluster.test.tsx` expectations that assert the
  old `msg →`/arrow

**Approach:**
- `shortLabel(u)`: if `u.hostname` matches `<ws>.slack.com` with a non-`app`/`www` subdomain,
  return the title-cased `<ws>`; otherwise (`slack.com`, `app.slack.com`) return `"Slack"`. Never
  append `" →"`, so `stripDeepLinkMarker` reports `isDeepLink: false` and `links.tsx` renders no
  `ArrowUpRight` for Slack. Message links have no unfurled title, so `linkLabel` falls to this
  workspace label — exactly the "show the workspace name instead" ask.

**Patterns to follow:** the other provider `shortLabel`s in `packages/domain/src/links/providers/`;
`stripDeepLinkMarker`/`linkLabel` contract in `registry.ts`.

**Test scenarios:**
- Happy path: `https://moonbase.slack.com/archives/C123/p169…` → label `"Moonbase"`, not a deep link.
- Happy path: `https://acme.slack.com/…` → `"Acme"`.
- Edge case: `https://app.slack.com/client/T1/C1` → `"Slack"`.
- Edge case: `https://slack.com/…` (no subdomain) → `"Slack"`.
- Regression: `stripDeepLinkMarker(shortLabelFor(slackUrl)).isDeepLink === false` (no arrow).
- Regression: non-Slack deep links (e.g. Claude `session →`) still mark `isDeepLink: true`.

**Verification:** Registry tests updated for the new labels; the Links section shows the
workspace name with no arrow (dark-mode screenshot); other providers unaffected; tests green.

## System-Wide Impact

- **Interaction graph:** `setCardPriority` (Unit 3) is the shared mutation for the drawer picker,
  the board keyboard priority-cycle (`board-view.tsx`), and the agent command — all inherit the
  Urgent float; `addCard` inherits the same "urgent → top" placement so create and transition
  agree. `deleteCard` (Unit 2) is agent-reachable via the command layer (R13 agent-native
  parity). `createCard` gains optional fields (priority, labelIds) consumed by the composer, the
  filter-seeding path (Unit 5), and the agent.
- **Error propagation:** `openExternal` and the opener import never throw (swallowed like
  `notify.ts`); `deleteCard`/relation commands no-op on unknown ids rather than throwing.
- **State lifecycle risks:** hard delete removes a Y.Map key — concurrent nested edits to a
  deleted card are dropped on merge (acceptable single-user); orphaned activity-log entries remain
  (deferred). Related sets are cleaned on delete to avoid dangling refs.
- **API surface parity:** the list view and swimlanes render the same `Card`s; Unit 5 threads
  defaults through `column-cards` **and** `swimlanes` composers. Item 8's hide-empty toggle only
  exists on the board (`board-view`), so list/swimlane need no change there.
- **Integration coverage:** relate-then-delete (Unit 1→2), filter-seed-Urgent-then-float (Unit
  5×3), and drag-vs-click (Unit 7) are cross-behavior interactions called out in test scenarios.
- **Unchanged invariants:** Archive (`archiveCard`) semantics, the fractional-`ord` model, the 8
  fixed status columns, and web anchor behavior (cmd/middle-click) are explicitly preserved.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Tauri opener versions/capability wrong → desktop links still dead | Mirror `notify.ts`/existing capability entries; verify on a real desktop rebuild; record pinned versions in the unit doc. |
| Whole-card `onClick` swallows drags or vice-versa | Rely on dnd-kit's 5px activation distance; manual drag test on the board; no other interactive controls on the face. |
| Urgent float fights manual ordering | Scoped to the non-urgent→urgent transition only; card stays draggable afterward (user chose "move once"). |
| Hard delete loses data with no undo | Explicit confirm dialog; Archive remains the reversible option; scope note that Archive view is future work. |
| `deriveCardDefaults` over-reaches on complex filters | Only top-level AND + `is` equality; everything ambiguous ignored; unit-tested across clause shapes. |
| Slack label change breaks existing link tests | Update `registry.test.ts` + link render tests in the same unit. |
| Related-ref cleanup missed on delete → dangling ids | Unit 2 depends on Unit 1; cleanup mirrors `deleteLabel`; integration test asserts peer cleanup. |

## Documentation / Operational Notes

- One `docs/units/UNIT-9.x-*.md` per unit (per `CLAUDE.md` §1), committed with its unit.
- If the Related section or Delete/Archive footer introduces a reusable pattern, note it in
  `docs/design/DESIGN.md`.
- Desktop units require a Tauri rebuild to verify; all JS/TS units verify via
  `vitest`/typecheck/lint/build with the Node 22.17.1 PATH prefix.
- Consider re-seeding the demo account (`packages/sync/scripts/seed-demo-board.ts`,
  `SEED_RESET=1`) with a related-pair and a Slack link fixture for manual/e2e checks.

## Sources & References

- Origin: user punch-list (no upstream `docs/brainstorms/*-requirements.md`).
- Repo rules: `CLAUDE.md`, `PLAN.md`, `docs/design/DESIGN.md`.
- Related code: `packages/sync/src/board-doc.ts`, `packages/commands/src/commands/card.ts`,
  `packages/domain/src/filters.ts`, `packages/domain/src/links/`, `apps/web/components/card/`,
  `apps/web/components/board/`, `apps/desktop/src-tauri/`.
- Memory: `boardly-board-collapse`, `boardly-local-production`, `boardly-e2e-verification`.
