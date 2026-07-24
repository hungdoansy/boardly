---
title: "feat: Archive view — see and restore archived cards"
type: feat
status: active
date: 2026-07-24
---

# feat: Archive view — see and restore archived cards

## Overview

Cards can already be archived (right-click → Archive, the card-detail drawer, and the `e`
keyboard shortcut), and archiving deliberately **keeps** the card in the board doc (`archived: true`,
`deletedAt` set) — unlike hard delete, which removes it. But there is currently **no way to see
archived cards or bring one back**. Every card selector (`cardsInStatus`, `allLiveCards`) filters
archived cards out, so once archived a card silently vanishes with no path to recovery.

This adds an **Archive view**: a dedicated, full-area destination (sidebar nav item + `#archive`
hash route, mirroring Settings) that lists every archived card, newest-archived first, with a
**Restore** action (returns the card to its prior status column) and a **Delete permanently**
action (the existing hard-delete, behind the same confirm dialog). It also adds the missing
`unarchiveCard` command to the command layer so agents get restore parity (R13), and seeds a couple
of archived fixtures into the demo account so the view is populated.

This closes the loop opened in the UNIT-9.x UX batch, whose delete-vs-archive split explicitly
deferred "kept-in-doc for a **future Archive view**" (see `packages/sync/src/board-doc.ts:802`).

## Problem Frame

Archiving is a reversible "get it off my board without losing it" action — the counterpart to
irreversible delete. The reversibility is currently a lie: nothing surfaces archived cards and no
restore path exists. A user who archives a card (intentionally or by fat-fingering the `e`
shortcut) cannot get it back short of editing the Yjs doc. The archived _projects_ feature already
solved this shape — a "Hidden" list in Settings with a one-click restore — so the pattern, hooks,
and command conventions to follow already exist in-repo; this applies them to cards and gives them
their own view because archived cards are primary content and can be numerous.

## Requirements Trace

- R1. A user can view all archived cards in one place, distinct from the board.
- R2. A user can restore an archived card; it returns to the board in the status column it held.
- R3. A user can permanently delete an archived card from the Archive view (with the existing
  irreversible-delete confirmation).
- R4. Archived cards are ordered most-recently-archived first.
- R5. Restore is available to agents too — a command in the catalog, surfaced via REST + MCP (R13
  agent-native parity: any action a user can take, an agent can take).
- R6. The Archive view is a real, linkable route (`#archive`) reachable from the sidebar and by
  keyboard, and it participates in the ESC ladder.
- R7. The demo/seed account contains archived cards so the view is demonstrable.
- R8. Empty state: when nothing is archived, the view shows a calm empty message, not a blank pane.

## Scope Boundaries

- **Not** changing how archiving is triggered (the existing Archive affordances stay as-is).
- **Not** adding filter/sort/group/search controls inside the Archive view — a flat, dated list is
  the MVP. (The board's `resolveView` pipeline could be layered on later.)
- **Not** adding bulk actions (multi-select restore/delete).
- **Not** changing archived-_project_ handling — projects keep their existing "Hidden" list in
  Settings › Projects. This view is for archived **cards**. (Noted as a deliberate non-merge in Key
  Technical Decisions.)
- **Not** virtualizing the list — archived counts are expected to be modest; the same
  `content-visibility` cheap-windowing trick the list view uses (`list-view.tsx:211`) is enough.

### Deferred to Separate Tasks

- **Linkable (`#`-routed) archived-card open**: the Archive view opens cards in a **local-state**
  drawer (not the ticket hash), because the hash resolver (`useSelectedCard`) resolves numbers over
  `useAllCards` (live cards only). A local `openCardId` works because `getCard(doc, id)` resolves any
  card regardless of `archived`. Making an archived card openable via a shareable `#PREFIX-N` URL
  (teaching the hash resolver to include archived cards) is deferred.
- Filter/sort/group inside the Archive view: future iteration.

## Context & Research

### Relevant Code and Patterns

**The archived-projects feature is the template to mirror for cards:**

- `packages/sync/src/board-doc.ts` — `archiveProject` / `unarchiveProject` / `listProjects` /
  `listArchivedProjects` (lines 965–1004). Cards have the analogous `archiveCard`
  (line 787) and `deleteCard` (line 807) but **lack** `unarchiveCard` and `listArchivedCards`.
- `packages/commands/src/commands/project.ts` — `archiveProject` / `unarchiveProject` (`showProject`)
  commands. `packages/commands/src/commands/card.ts` has `archiveCard` (line 214) and `deleteCard`
  (line 251) but no restore command.
- `packages/commands/src/catalog.ts` — the single registry; REST (Unit 3.9) + MCP (Unit 3.10)
  derive their agent surface from it. A new command must be registered here (and appears in
  `catalog.test.ts`).
- `apps/web/lib/use-projects.ts` — `useProjects` / `useArchivedProjects` / `useProjectActions`
  (archive/show). Model `useArchivedCards` + a `unarchive` card action on this.
- `apps/web/components/settings/project-settings.tsx` — the `HiddenRow` restore-row UI (Eye icon,
  "Show" button). Model the Archive view's row on this + the list-view `ListRow`.

**Routing / shell:**

- `apps/web/lib/route.ts` — hash-route grammar + `parseRoute`. Add an `archive` route alongside
  `settings`.
- `apps/web/lib/use-boards.ts` — `useSettingsRoute()` (lines 96–106) is the exact shape for
  `useArchiveRoute()`.
- `apps/web/components/app/workspace-app.tsx` — `Shell` chooses `SettingsView` vs `MainArea`
  (line 122); `Sidebar` renders the Settings nav item (lines 173–188); `useGlobalKeyboard` runs the
  ESC ladder (lines 56–92). All three need the archive route threaded in.

**Card list rendering / selectors:**

- `apps/web/components/board/list-view.tsx` — `ListRow` (lines 186–238): dense 37px row with status
  glyph, mono shortId, title (line-through when terminal), badge row. The Archive row is this plus
  Restore/Delete affordances (and no ticket-hash open).
- `packages/sync/src/board-doc.ts` — `allLiveCards` (line 1069) filters `!archived`; the new
  `listArchivedCards` is its complement, sorted by `deletedAt` desc.

**Activity + confirm-delete:**

- `packages/domain/src/activity.ts` — fixed `ActivityEntry` union; `type: "archived"` at line 57.
  Add `type: "unarchived"`.
- `packages/sync/src/board-doc.ts` — `rowToActivity` switch (`case "archived"` at line 371) +
  `appendActivity`.
- `apps/web/components/card/card-context-menu.tsx` — the delete-confirm `Dialog` (lines 184–209):
  reuse this exact pattern for permanent-delete from the Archive view.

### Institutional Learnings

- `docs/units/UNIT-9.2-hard-delete-card.md` and the UNIT-9.x batch established the delete
  (irreversible, confirm) vs archive (kept-in-doc) split and named the future Archive view.
- Memory: `boardly-ux-batch-plan` — "delete = hard-delete + confirm vs archive = kept-in-doc
  (future Archive view)". This plan is that future view.
- CLAUDE.md §2 (design, dark-mode first), §3 (derive don't synchronize; command layer for all
  mutations; scoped `useY` subscriptions), §1 same-commit docs rule.

## Key Technical Decisions

- **Top-level view, not a Settings section.** Archived projects live in Settings because they're a
  small config concern; archived cards are primary content and potentially numerous, so they get a
  full-area, scannable, Linear-style destination with its own route (`#archive`) and sidebar entry.
  _Alternative considered:_ an "Archived" section inside Settings (cheaper, consistent with hidden
  projects) — rejected because it buries recoverable content and doesn't scale to many cards.
- **Restore returns the card to its stored status**, not to a fixed column. `archiveCard` never
  clears `status`, so `unarchiveCard` only flips `archived`/`deletedAt` back and the card reappears
  in its original column. No status remap needed.
- **Add an `"unarchived"` activity kind** so restore is auditable and symmetric with `"archived"`.
  Small, contained addition (domain union + `rowToActivity` case + activity.tsx label).
- **New command `unarchiveCard`, registered in the catalog** — restore is a first-class action for
  agents via REST/MCP, not a UI-only affordance (R13). Delete-permanently reuses the existing
  `deleteCard` command.
- **`deletedAt` doubles as the archive timestamp** and the sort key (desc). No new field.
- **Rows open the existing `CardDetail` drawer via local state** (not the ticket hash), so a user
  can read a card's full contents before restoring. `CardDetail`/`useCardById` already resolve any
  card by id (`getCard` doesn't filter `archived`), so no hash-resolver change is needed. The drawer
  footer swaps its **Archive** action for **Restore** when the open card is archived. Rows also keep
  quick inline Restore + Delete affordances.

## Open Questions

### Resolved During Planning

- _Where does the view live?_ — Top-level `#archive` route + sidebar item (see Key Decisions).
- _What does restore do to status?_ — Nothing; the stored status is intact, card reappears in place.
- _Does restore log activity?_ — Yes, a new `"unarchived"` entry.
- _Confirm on restore?_ — No (reversible). Confirm on permanent delete — yes (reuse existing dialog).

### Deferred to Implementation

- Exact sidebar placement/label of the Archive item (directly above Settings vs below Search) and
  whether to show an archived-count badge — settle visually against DESIGN.md during Unit 4.
- Whether the archived-count hook warrants its own scoped selector or can derive from
  `useArchivedCards().length` — decide when wiring the sidebar (avoid an extra deep subscription if
  the count is only needed where the list is already loaded).

## Implementation Units

Units are dependency-ordered: sync selector/mutation → command → web hooks/route → view/shell →
seed. Docs batch id: **UNIT-14** (`UNIT-14.1` … `UNIT-14.5`).

- [ ] **Unit 1 (UNIT-14.1): Sync — `listArchivedCards` selector, `unarchiveCard` mutation, `"unarchived"` activity**

**Goal:** Give the sync layer a way to list archived cards and to restore one, and record restore
in the activity log.

**Requirements:** R2, R4

**Dependencies:** None

**Files:**

- Modify: `packages/domain/src/activity.ts` (add `type: "unarchived"` to the union; export stays via `ActivityEntry`)
- Modify: `packages/sync/src/board-doc.ts` (`listArchivedCards`; `unarchiveCard`; `rowToActivity` `case "unarchived"`)
- Test: `packages/sync/src/board-doc.test.ts` (or the existing card/archive test file — follow the file that currently tests `archiveCard`)

**Approach:**

- `listArchivedCards(doc)`: complement of `allLiveCards` — filter `getBool(c, "archived") === true`,
  map via `toPlain`, sort by `deletedAt` **descending** (most recently archived first). Reuse
  `boardPrefix` / `ticketNumberOverrides` / `toPlain` exactly as `allLiveCards` does.
- `unarchiveCard(doc, cardId, now, actor?)`: mirror `archiveCard` — inside `withCard`, no-op if not
  archived; set `archived` false, clear `deletedAt` (delete the key or set to `undefined`/`0`
  consistent with how `toPlain` reads it), `appendActivity({ type: "unarchived", cardId, at: now, actor })`.
- Add `case "unarchived": return withActor({ ...base, type: "unarchived" });` to `rowToActivity`.

**Patterns to follow:** `archiveCard` (board-doc.ts:787), `allLiveCards` (board-doc.ts:1069),
`unarchiveProject` (board-doc.ts:978), `rowToActivity` (board-doc.ts:356).

**Test scenarios:**

- Happy path: archive two cards, `listArchivedCards` returns exactly those two, and live selectors
  (`allLiveCards`, `cardsInStatus`) no longer include them.
- Edge (ordering): archive card A then card B (later `now`); `listArchivedCards` returns `[B, A]`
  (deletedAt desc).
- Happy path (restore): `unarchiveCard` on an archived card → it disappears from `listArchivedCards`,
  reappears in `allLiveCards` and in `cardsInStatus(itsStatus)`, with `archived === false` and
  `deletedAt` cleared.
- Edge: `unarchiveCard` on a non-archived (live) card is a no-op; on an unknown id is a no-op.
- Integration: after `unarchiveCard`, `cardActivity(cardId)` includes a newest-first `"unarchived"`
  entry with the passed `actor`.
- Edge: restore preserves the card's `status`, `priority`, `projectId`, labels, links (round-trip
  archive→unarchive leaves the plain card equal to the pre-archive card except timestamps).

**Verification:** New selector/mutation covered by unit tests; `pnpm typecheck` green (the domain
union change type-checks every `switch` over `ActivityEntry`).

---

- [ ] **Unit 2 (UNIT-14.2): Command — `unarchiveCard` + catalog registration**

**Goal:** Expose restore as a catalog command so UI and agents (REST/MCP) share one path.

**Requirements:** R5

**Dependencies:** Unit 1

**Files:**

- Modify: `packages/commands/src/commands/card.ts` (define `unarchiveCard`)
- Modify: `packages/commands/src/catalog.ts` (import + register in the `commands` array)
- Test: `packages/commands/src/catalog.test.ts`, and the card command test that exercises `archiveCard`

**Approach:**

- Define `unarchiveCard` command: `input: z.object({ cardId: z.string() })`, run calls
  `syncUnarchiveCard(ctx.getBoardDoc(), input.cardId, ctx.now(), ctx.userId ?? ctx.clientId)` and
  returns `{ id: input.cardId, archived: false }` — exact inverse of `archiveCard` (card.ts:214).
- Register in `catalog.ts` next to `archiveCard`.
- Description should mirror `archiveCard`'s ("Restore an archived card to the board.").

**Patterns to follow:** `archiveCard` command (card.ts:214), `showProject`/`unarchiveProject`
wiring (project.ts:66–73), catalog registration (catalog.ts:63, 87).

**Test scenarios:**

- Happy path: `execute(unarchiveCard, ctx, { cardId })` on an archived card flips it live (assert via
  a sync selector), returns `{ id, archived: false }`.
- Integration (catalog/agent surface): `getCommand("unarchiveCard")` is defined; it appears in
  `listCommandNames()`; its zod `input` validates `{ cardId }` and rejects `{}`.
- Error path: invalid input (missing `cardId`) is rejected at the command boundary.

**Verification:** `unarchiveCard` is enumerable in the catalog (so REST/MCP pick it up with no extra
wiring); command tests green.

---

- [ ] **Unit 3 (UNIT-14.3): Web — `#archive` route, `useArchiveRoute`, `useArchivedCards`, restore action**

**Goal:** Add the routing + reactive hooks the Archive view and shell need.

**Requirements:** R2, R4, R6

**Dependencies:** Unit 2

**Files:**

- Modify: `apps/web/lib/route.ts` (add `archive: boolean` to `Route`; parse `#archive`; ensure it's
  mutually exclusive with settings/project/ticket)
- Modify: `apps/web/lib/use-boards.ts` (add `useArchiveRoute()` mirroring `useSettingsRoute`)
- Modify: `apps/web/lib/use-board.ts` (add `useArchivedCards()`; add `unarchive` to `CardActions` +
  `useCardActions`)
- Test: `apps/web/lib/route.test.ts`, `apps/web/lib/use-boards.test.tsx`

**Approach:**

- `route.ts`: `parseRoute` returns `archive: true` for raw `"archive"` (same guard style as the
  `"settings"` early-return). Add `archive: false` to every other return. Keep `buildBoardHash`
  unchanged; writing `#archive` is done directly like `writeHashBody("archive")`.
- `useArchiveRoute()`: copy `useSettingsRoute` shape — `useSyncExternalStore(subscribeRoute, () =>
parseRoute(currentHashBody()).archive, () => false)` + setter writing `"archive"` / `""`.
- `useArchivedCards()`: `useY(boardCards(doc), () => listArchivedCards(doc), { deep: true })` —
  mirror `useAllCards` (use-board.ts:211). Scoped/deep so only archive-relevant changes re-render.
- Add `unarchive(cardId)` to `CardActions` calling `execute(unarchiveCard, ctx, { cardId })`, next
  to `archive` (use-board.ts:303). `delete` already exists for permanent delete.

**Patterns to follow:** `useSettingsRoute` (use-boards.ts:96), `useAllCards` (use-board.ts:211),
the `archive`/`delete` actions (use-board.ts:303–314).

**Test scenarios:**

- Happy path (route): `parseRoute("#archive")` → `{ archive: true, settings: false, projectId: null,
ticketNumber: null }`; `parseRoute("#settings")` and board/ticket routes all have `archive: false`.
- Edge: `#archive` and `#settings` are never both true; a ticket ref like `#BRD-42-x` is not parsed
  as archive.
- Happy path (hook): `useArchiveRoute` returns false initially; setting true writes `#archive` and
  the store updates in the same tick (jsdom test like the settings-route test).
- Integration: `useArchivedCards` reflects a live archive/unarchive within the test doc (returns the
  archived card, then drops it after restore).

**Verification:** Route + hooks unit-tested; opening/closing `#archive` is reflected reactively.

---

- [ ] **Unit 4 (UNIT-14.4): Web — Archive view component + sidebar nav + shell/ESC wiring + DESIGN.md**

**Goal:** Render the Archive view, make it reachable, and document the UI.

**Requirements:** R1, R2, R3, R6, R8

**Dependencies:** Unit 3

**Files:**

- Create: `apps/web/components/archive/archive-view.tsx`
- Create: `apps/web/components/archive/archive-view.test.tsx`
- Modify: `apps/web/components/card/card-detail.tsx` (footer: show Restore when `card.archived`)
- Modify: `apps/web/components/app/workspace-app.tsx` (Shell render branch; Sidebar nav item;
  `useGlobalKeyboard` ESC ladder + archive route state)
- Modify: `docs/design/DESIGN.md` (Archive view + sidebar nav item + Restore/Archive icons)

**Approach:**

- `ArchiveView`: full-area shell like `SettingsView` (`settings-view.tsx`) — header with a back
  button (`ArrowLeft`, calls `onClose`) + "Archive" title, then a scrollable list. Consume
  `useArchivedCards()`, `useLabels()`, `useBadgeConfig()`, `useCardActions()`.
  - Rows modeled on `ListRow` (`list-view.tsx:186`): status glyph, mono `shortId`, title
    (line-through when terminal), project chip / badge row, plus a right-aligned relative
    "archived <time> ago" (from `deletedAt`) and two affordances: **Restore** (`ArchiveRestore`
    lucide icon → `actions.unarchive(card.id)`) and **Delete** (`Trash2`, destructive → opens the
    reused confirm dialog → `actions.delete(card.id)`).
  - Clicking the row body opens the card in a **local-state** `CardDetail` drawer (`const [openId,
setOpenId] = useState<string|null>(null)`), so contents are viewable before restoring. The
    inline Restore/Delete buttons `stopPropagation` so they don't also open the drawer.
  - Empty state: centered calm message ("No archived cards." — cf. list-view "No cards match.").
  - Icons are lucide SVGs only (CLAUDE.md §2 icon ban). Reuse the delete-confirm `Dialog` shape from
    `card-context-menu.tsx:184`.
- `card-detail.tsx`: in the footer (`CardDetailBody`), when `card.archived` render a **Restore**
  button (`ArchiveRestore` → `actions.unarchive(card.id)` then `onClose`) in place of the **Archive**
  button; the Delete action is unchanged. This keeps the drawer coherent for archived cards whether
  opened from the Archive view (now) or a future hash route.
- `workspace-app.tsx`:
  - `Shell`: add `const [archiveOpen, setArchiveOpen] = useArchiveRoute();` Render precedence in the
    main area: `settingsOpen ? <SettingsView…/> : archiveOpen ? <ArchiveView onClose={…}/> :
<MainArea/>`. (Routes are hash-exclusive, so at most one is true.)
  - `Sidebar`: add an "Archive" nav button (lucide `Archive` icon), `aria-pressed={archiveOpen}`,
    styled like the Settings item, placed adjacent to Settings. Optional archived-count on the right
    (defer per Open Questions).
  - `useGlobalKeyboard`: extend the ESC ladder — if `archiveOpen`, ESC exits archive (before the
    reset-to-All-projects fallback), same as the settings branch. Thread `archiveOpen`/`onExitArchive`
    through the hook's opts.

**Patterns to follow:** `SettingsView` shell (`settings-view.tsx`), `ListRow` (`list-view.tsx:186`),
`HiddenRow` restore row (`project-settings.tsx:120`), delete-confirm dialog
(`card-context-menu.tsx:184`), Sidebar Settings item (`workspace-app.tsx:173`).

**Execution note:** Dark mode is the priority — verify the view and rows in dark mode first
(CLAUDE.md §2), then capture the required dark-mode screenshot for the unit doc.

**Test scenarios:**

- Happy path: with two archived cards in the doc, `ArchiveView` renders two rows with their
  shortIds/titles, newest-archived first.
- Happy path (restore): clicking Restore calls the unarchive action; the row disappears from the
  view (assert via re-render over a test doc) and the card is live again.
- Happy path (delete): clicking Delete opens the confirm dialog; confirming hard-deletes the card;
  cancelling leaves it archived.
- Happy path (drawer): clicking a row body opens `CardDetail` for that archived card (contents
  render); the drawer footer shows **Restore** (not Archive); clicking Restore unarchives and closes.
- Edge (drawer vs inline): clicking the inline Restore/Delete buttons does not also open the drawer
  (propagation stopped).
- Edge (empty): no archived cards → empty-state message, no rows.
- Integration (routing/shell): activating `#archive` renders `ArchiveView` (not board/settings);
  the sidebar Archive item shows `aria-pressed`; ESC from the archive view returns to the board
  (ladder), and ESC yields when a dialog is open (existing `escIsOwnedElsewhere` guard).
- A11y: Restore/Delete controls have accessible labels; the back button matches the Settings
  pattern; row content reachable by keyboard.

**Verification:** Component + shell tests green; manual dark-mode check matches DESIGN.md; ESC ladder
behaves (archive → board → All projects); sidebar toggles the route.

---

- [ ] **Unit 5 (UNIT-14.5): Seed — archived fixtures in the demo board**

**Goal:** Populate the demo account so the Archive view isn't empty on first look.

**Requirements:** R7

**Dependencies:** Unit 1 (uses `archiveCard`/`unarchiveCard` semantics indirectly via seed writes)

**Files:**

- Modify: `packages/sync/scripts/seed-demo-board.ts`

**Approach:**

- After the existing card fixtures are created, archive 2–3 representative cards (e.g. via the same
  sync `archiveCard` the app uses, or by setting `archived`/`deletedAt` through the seed's existing
  write path) with staggered `deletedAt` so ordering is visible. Prefer routing through the command/
  sync archive path already imported by the seed rather than hand-setting fields, to stay honest to
  the real mutation. Respect the `SEED_RESET=1` wipe/rebuild flow already in the script.

**Patterns to follow:** existing card-creation blocks in `seed-demo-board.ts`; memory
`boardly-seed-demo-account` (always seed into demo@boardly.app; `SEED_RESET=1` wipes+rebuilds).

**Test scenarios:** `Test expectation: none` — this is fixture data, not behavior. Verify manually:
run the seed, open the demo account, confirm the Archive view lists the seeded archived cards
newest-first and Restore returns one to its column.

**Verification:** Seed runs clean; demo account's Archive view is populated and restore works
end-to-end against real synced data.

## System-Wide Impact

- **Interaction graph:** New command `unarchiveCard` flows into the same `execute` path as every
  other mutation and is auto-picked-up by REST (Unit 3.9) and MCP (Unit 3.10) from the catalog — no
  separate agent wiring. New `"unarchived"` activity kind flows into the card activity timeline
  (`card-detail.tsx` / `activity.tsx`) automatically once the union + `rowToActivity` + label are
  added.
- **Error propagation:** `unarchiveCard`/`listArchivedCards` no-op on missing/mismatched cards
  (mirrors `archiveCard`), so restore is idempotent under concurrent sync.
- **State lifecycle risks:** Restore must fully clear `deletedAt` (not just flip `archived`) so the
  card isn't treated as freshly-archived on the next round-trip and so the archive sort key is
  correct. Covered by the round-trip test in Unit 1.
- **API surface parity:** `archiveCard` already exists in UI + command + REST + MCP; this adds the
  missing inverse everywhere it's missing (command/catalog), achieving parity.
- **Integration coverage:** Restore-then-activity and route→view→shell are cross-layer; covered by
  integration scenarios in Units 1, 3, and 4.
- **Unchanged invariants:** `archiveCard`, `deleteCard`, hidden-projects handling, the board/list
  card selectors' `!archived` filter, and the ticket-hash grammar for live cards are unchanged. The
  Archive view is additive; existing routes keep their meaning.

## Risks & Dependencies

| Risk                                                                                | Mitigation                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding a union member to `ActivityEntry` breaks exhaustive switches elsewhere       | TypeScript strict surfaces every non-exhaustive `switch`; fix each at compile time. Grep for `ActivityEntry["type"]`/activity switches before finishing Unit 1. |
| `deletedAt` left set after restore corrupts archive ordering / re-archive detection | Explicit "clear `deletedAt` on restore" step + round-trip unit test.                                                                                            |
| Route precedence bug (archive + settings both rendering)                            | Hash is single-valued and parsed with early-returns; add a route test asserting mutual exclusivity, and order the Shell ternary settings → archive → board.     |
| ESC ladder regression (archive not exiting, or stealing ESC from dialogs)           | Reuse the existing `escIsOwnedElsewhere` guard untouched; add archive as a ladder rung parallel to settings; cover with the shell integration test.             |
| Opening archived cards expected but not supported                                   | Explicitly scoped out (Deferred), with the resolver reason documented so it's a known gap, not a silent one.                                                    |

## Documentation / Operational Notes

- Per CLAUDE.md §1 (same-commit docs rule): each unit ships its `docs/units/UNIT-14.x-*.md` in the
  same commit as its source; any visual/interaction change (Unit 4) updates `docs/design/DESIGN.md`
  (new Archive view, sidebar Archive nav item, Restore/Archive icons). Commit subjects carry
  `UNIT-14.x`.
- No migration/rollout concerns: purely additive, client-side, static-export safe (no new
  `window`/storage access beyond the existing hash-route utilities).
- Update memory `boardly-ux-batch-plan` note (the "future Archive view" is now built) once shipped.

## Sources & References

- Delete-vs-archive origin: `docs/units/UNIT-9.2-hard-delete-card.md`, comment at
  `packages/sync/src/board-doc.ts:802`.
- Archived-projects template: `packages/sync/src/board-doc.ts:965-1004`,
  `apps/web/components/settings/project-settings.tsx`, `apps/web/lib/use-projects.ts`.
- Routing/shell: `apps/web/lib/route.ts`, `apps/web/lib/use-boards.ts:96`,
  `apps/web/components/app/workspace-app.tsx`.
- Row rendering: `apps/web/components/board/list-view.tsx:186`.
- Agent surface: `packages/commands/src/catalog.ts`, `packages/commands/src/catalog.test.ts`.
