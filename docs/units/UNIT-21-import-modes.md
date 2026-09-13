# UNIT 21: Board import modes and full-fidelity export

- **Plan unit:** U1–U7 (`docs/plans/2026-09-04-1815-feat-board-import-modes-plan.md` →
  Implementation Units)
- **Status:** in progress — U1 done, U2–U7 pending
- **Requirements:** R1–R25 (named per sub-unit below)
- **Dependencies:** UNIT-4.4 (import/export), UNIT-20 (projects), UNIT-15 (zoom) — satisfied
- **Commit(s):** _one per sub-unit_

A user can carry their board between machines, restore it from a file, and pull a file's contents
into the board they are already using — without losing projects on the way out, and without a stale
or wrong file destroying work on the way in. Each sub-unit adds its own section here.

---

## U1. Widen the snapshot format to v2

**Requirements:** R1 (export carries the full board), R2 (versioned, older files still parse), R3
(a newer file is rejected, not partially read), R5 (Markdown stays an outline), R23 (a snapshot is
authorable by hand). **Governing decision:** KTD2.

### What changed

**`packages/domain/src/io/snapshot.ts`** — `SNAPSHOT_VERSION` 1 → **2**, and the shape widened to
cover everything the board doc holds:

| Section                  | v1       | v2                                                                          |
| ------------------------ | -------- | --------------------------------------------------------------------------- |
| `projects[]`             | —        | `{id, name, color, ord?, archived, deletedAt?}`                             |
| `card.projectId`         | —        | optional string                                                             |
| `card.deletedAt`         | —        | optional number (archive timestamp, pairs with `archived`)                  |
| `board.showEmptyColumns` | —        | boolean, default `true`                                                     |
| `board.zoom`             | —        | number, default `DEFAULT_ZOOM`                                              |
| `views[]`                | —        | saved views: `{id, name, filter, sort?, groupBy?, layout?, visibleBadges?}` |
| `card.ord`, `label.ord`  | required | **optional** (R23)                                                          |

New exported types: `SnapshotProject`, `SnapshotView` (alongside `SnapshotCard`, `SnapshotLabel`).

**`packages/domain/src/io/json.ts`** — `parseJson` now gates on the parsed `version`: a file above
this build's is rejected with an `ImportError` naming both the file's format version and the highest
this build reads. Nothing is returned.

**`packages/domain/src/filters.ts`** — the filter/sort/group vocabulary is now declared as runtime
tuples (`FILTER_FIELDS`, `FILTER_CONDITIONS`, `SORT_FIELDS`, `SORT_DIRECTIONS`, `GROUP_BY_FIELDS`,
`VIEW_LAYOUTS`) with the existing types derived from them (`type FilterField = (typeof
FILTER_FIELDS)[number]`, …) — the `STATUS_VALUES` pattern. The public types are unchanged; the
snapshot's view schema builds its zod enums from these tuples.

**`packages/domain/src/io/obsidian.ts`** and **`packages/sync/src/board-doc.ts`
(`boardToSnapshot`)** — both hand-build a `BoardSnapshot`, and a zod `.default()` makes its field
non-optional in the inferred type, so both had to supply the new sections. Obsidian markdown
genuinely has none of them (empty/default is the truthful value). `boardToSnapshot` supplies
empty/default values **as a placeholder** with a comment pointing at U2, which is where it starts
emitting the real ones.

**`packages/domain/src/io/markdown.ts`** — `byOrd` accepts an optional `ord` (cards without one
compare equal, so a stable sort leaves them in array order). `exportMarkdown` is otherwise untouched:
it already filters archived cards, and it carries none of the new sections (R5).

**`packages/sync/src/schema.ts`** — exports `BOARD_ROOTS` / `BoardRoot` and `BOARD_META_KEYS` /
`BoardMetaKey`. The root accessors go through private `rootMap`/`rootArray` helpers typed on
`BoardRoot`, and `boardMeta` now returns a `BoardMetaMap` whose `set` only accepts a `BoardMetaKey`.

**`packages/sync/src/schema-coverage.test.ts` (new)** — the drift guard.

**`packages/domain/src/io/fixtures/board-v1.json`, `board-v2.json` (new)** — committed interchange
files, parsed verbatim by the tests.

### Why

- **v2 with zod defaults, not a migration function (KTD2).** Every v2 addition has a default, so a
  v1 file — no `projects`, no `projectId`, no `views` — parses as "v2 with no projects and no views".
  Sections a file predates are absent, not errors (R2). A separate `migrateV1toV2` step would be a
  second place for the shape to be described, and it would have nothing to do.
- **Newer files are rejected outright (R3).** `boardSnapshotSchema` is non-strict, so zod strips keys
  it does not know **silently**. Best-effort reading a v3 file would therefore drop whole sections
  with no error anywhere — which is precisely how the v1 export lost projects, views and archived
  cards without anyone noticing. The version gate turns that class of loss into a message.
- **Nothing v1 could carry was moved or renamed.** An already-shipped v1 reader cannot be fixed
  retroactively; restructuring a field it knows would make it lose data with no error. So v2 is
  purely additive.
- **`ord` is optional (R23).** A caller authoring a snapshot cannot be expected to invent valid
  `keyBetween` fractional-index keys; the write path generates them, in array order.
- **The view schema derives its enums from the domain's own tuples.** `packages/commands/src/commands/view.ts`
  already carries a hand-written copy of this schema, and it has _drifted_: it lists six filter
  fields and is missing `project`, added by UNIT-20 — so a saved view filtering by project would
  fail validation there. Deriving the snapshot's enums from `FILTER_FIELDS` makes that particular
  drift impossible for the interchange format.
- **The drift guard checks a declared list, not a fixture doc.** A `Y.Doc` keeps no registry of its
  roots (`doc.getMap("anything")` conjures one on demand) and meta keys are written ad hoc, so
  introspecting a seeded doc can only ever show the sections somebody remembered to touch — which is
  the exact opposite of the next-drift case. Declaring `BOARD_ROOTS`/`BOARD_META_KEYS` and typing the
  writes against them is what makes a new section impossible to add silently.

### How it works

**Reading a file.** `parseJson` → `JSON.parse` (throws `ImportError: File is not valid JSON.`) →
`boardSnapshotSchema.safeParse` (throws `ImportError` naming the first failing field path) → version
gate → the snapshot. The gate is deliberately last: it runs on the _parsed_ `version`, so a file with
no `version` key at all has taken the `SNAPSHOT_VERSION` default by then and is read as current.

**The drift guard.** `schema-coverage.test.ts` asserts that every entry of `BOARD_ROOTS` and
`BOARD_META_KEYS` is either represented in `boardSnapshotSchema` or on a named "not exported"
allowlist. The mapping is not always name-for-name, so the test declares two alias maps: the `meta`
root is carried as the snapshot's `board` section, and the `views` meta key is carried at the
snapshot's top level. Current allowlist, with the reason each entry carries:

| Not exported             | Why                                                                               |
| ------------------------ | --------------------------------------------------------------------------------- |
| `activity` root          | Append-only local history; an import must not fabricate events it never observed. |
| `shortIdSeq`             | Derived on write from the highest ticket number across both sides (KTD5).         |
| `createdAt`, `updatedAt` | Board-level timestamps are stamped by the writer, not carried by the file.        |
| `createdBy`              | Board ownership belongs to the importing user, never to the file's author.        |

A fourth assertion keeps the allowlists honest (no entry may name a root or key that no longer
exists), and a fifth pins the four sections whose absence caused this plan.

The chain that makes it bite: a new doc section needs `doc.getMap`/`getArray`, which only
`rootMap`/`rootArray` call, and they take a `BoardRoot` — so the root must be declared. A new board
preference needs `meta.set`, whose key is a `BoardMetaKey` — so the key must be declared. Either
declaration then fails the guard until the snapshot or the allowlist accounts for it.

### How to test / verify

```bash
pnpm --filter @boardly/domain test    # 157 (was 146)
pnpm --filter @boardly/sync test      # 78  (was 74)
pnpm -r typecheck
```

Tests added in `packages/domain/src/io/io.test.ts`:

- **v2 carries the whole board (R1)** — a snapshot with projects (one archived, with `deletedAt`),
  a project-assigned card, a nested-group saved view, `showEmptyColumns`/`zoom` and an archived card
  round-trips `exportJson` → `parseJson` deep-equal (the pre-existing round-trip test, now over the
  widened fixture) plus per-section assertions; the committed `fixtures/board-v2.json` parses with
  every section intact; `SNAPSHOT_VERSION` is 2 and `exportJson` stamps it.
- **Older files still import (R2)** — the committed `fixtures/board-v1.json` parses with
  `version: 1`, `projects: []`, `views: []`, no card `projectId`, and the v2 board preferences at
  their defaults, while everything v1 _did_ carry survives; a file with no `version` key parses as
  the current version.
- **A newer file is rejected (R3)** — `version: 99` throws `ImportError` whose message names both 99
  and the supported version; a `version: 3` file leaves the caller's variable untouched (nothing is
  returned); non-JSON text throws before any schema work.
- **Authorable by hand (R23)** — a snapshot whose cards, labels and projects carry no `ord` parses
  (ords come back `undefined`) and the rest still defaults; unknown extra fields on a card are
  stripped rather than thrown on.
- **Markdown (R5)** — a new assertion that archived cards, projects and views never appear in the
  Markdown outline.
- One **existing** test changed: "throws ImportError (with a path) when a required field is missing"
  used a card missing `ord`, which is legal from v2 on. It now omits `title`, which is genuinely
  required, and asserts the path names `title`.

`packages/sync/src/schema-coverage.test.ts` (4 tests) is the drift guard described above.

**Proof the guard bites** (run locally, then reverted):

- Adding `"attachments"` to `BOARD_ROOTS` and `"lastOpenedViewId"` to `BOARD_META_KEYS` →
  `AssertionError: expected [ 'attachments' ] to deeply equal []` and
  `expected [ 'lastOpenedViewId' ] to deeply equal []`.
- Adding `meta.set("lastOpenedViewId", "v1")` to `setShowEmptyColumns` without declaring the key →
  `error TS2345: Argument of type '"lastOpenedViewId"' is not assignable to parameter of type
'"zoom" | "title" | … | "shortIdSeq"'`.

### Follow-ups / known gaps

- **`boardToSnapshot` still emits empty v2 sections.** `projects: []`, `views: []`,
  `showEmptyColumns: true`, `zoom: DEFAULT_ZOOM`, no per-card `projectId`, and archived cards still
  filtered out. Export fidelity (R1) is only really delivered by **U2**; U1 delivers the format that
  can hold it.
- **A snapshot with no `ord` imports with `ord: ""`.** `buildBoardFromSnapshot` writes `card.ord`
  verbatim, so an ord-less hand-authored card currently lands with an empty ord (verified: no throw,
  no corruption — it simply sorts first and ties with other ord-less cards). **U4** generates ords at
  write time, in array order; until then R23 is honored by the parser but not by the writer.
- **`packages/commands/src/commands/view.ts` keeps its own copy of the saved-view schema**, and that
  copy is missing the `project` filter field (UNIT-20 drift). Not fixed here to keep this unit inside
  the io/ boundary; the natural fix is for `saveView` to reuse the snapshot's `savedViewSchema` —
  worth doing when U5 touches the command layer.
- **`markdown.ts` is unchanged by design (R5).** If Markdown ever needs to carry projects, it is a
  new format decision, not a widening of this one.
- **Board `createdAt`/`updatedAt`/`createdBy` are not interchange data.** If a future unit wants
  provenance in the file, it has to add the fields _and_ drop them from the guard's allowlist.

---

## U2. Read the widened snapshot out of the doc

### What changed

- `packages/sync/src/board-doc.ts`
  - `boardToSnapshot` now emits everything the v2 format can represent: `board.showEmptyColumns`
    and `board.zoom`, the full `projects` array, the board's saved `views`, per-card `projectId`,
    and **archived cards** (each carrying `archived: true` and its `deletedAt`). U1's placeholders
    are gone, and with them the now-unused `DEFAULT_ZOOM` import.
  - Two module-private helpers: `allCardsForSnapshot(doc)` (every card, archived included,
    ticket-number-repaired) and `allProjectsForSnapshot(doc)` (every project in `ord` order,
    archived included, with `deletedAt`).
- `packages/sync/src/io.test.ts` — new `board snapshot carries the whole doc (R1)` block, 6 tests.

No public API changed; `boardToSnapshot`'s signature is untouched. The write side
(`buildBoardFromSnapshot`) is deliberately unchanged — that is U4.

### Why

- **R1 — an export is a backup of the whole doc**, not a snapshot of what the board happens to
  render. Filtering archived cards is precisely how "carry my board to the new machine" silently
  dropped the Archive view, and dropping projects left every card's grouping behind.
- **A private `allCardsForSnapshot` rather than a new exported selector.** `allLiveCards` and
  `listArchivedCards` stay the app-facing selectors and keep their filters. Including archived cards
  is an export-only widening, so it should not become a public accessor a component later reaches
  for by accident.
- **`deletedAt` is read off the Y.Map, not added to `projectToPlain`.** The plain domain `Project`
  has no `deletedAt` and no UI reads one. Widening a type the whole app depends on to serve one
  serializer would push the field into every `listProjects` result for no consumer.
- **`showEmptyColumns` / `zoom` come from `boardToPlain`, not from `boardMeta` directly**, so an
  untouched board exports the same read-time defaults it renders with (and the same defensive zoom
  clamp) instead of a second copy of the default logic that could drift.
- **Views are shallow-copied.** `listViews` returns the very array stored on board meta; the
  snapshot is a value a caller may edit. Matches the existing `cards.map((c) => ({ ...c }))` style.

### How it works

`boardToSnapshot` reads the board through `boardToPlain` (getting `showEmptyColumns` and the
clamped `zoom` for free), then assembles four collections: `projects` (no archived filter, each
through `projectToPlain` plus `deletedAt` when present, sorted by `ord`), `labels` (unchanged),
`views` (shallow-copied), and `cards` (no archived filter, through the same
`boardPrefix` + `ticketNumberOverrides` + `cardToPlain` path the live selectors use, so `projectId`,
`deletedAt` and the repaired ticket number all come along).

Because every v2 addition carries a zod default (U1) and `buildBoardFromSnapshot` is untouched, the
pre-existing `doc → snapshot → JSON → new doc → snapshot` round-trip still passes: a board with no
projects, no views and default preferences produces identical snapshots on both sides.

### How to test / verify

`pnpm --filter @boardly/sync test` (85 tests), `pnpm --filter @boardly/domain test` (157),
`pnpm --filter @boardly/commands test` (51), `pnpm -r typecheck`.

The six new tests cover: two projects one archived, both exported with the right flags in `ord`
order; an archived project carrying `deletedAt` while a live one has none; a board with no projects
exporting `projects: []` as a present key; a card exporting its `projectId` while an unassigned one
has no such key; an archived card present with `archived: true` alongside the live card while
`allLiveCards` still hides it; and `showEmptyColumns: false` / `zoom: 1.25` / a populated saved view
surviving the read, against a board that set none of them exporting the defaults.

Not a UI change — no screenshot check.

### Follow-ups / known gaps

- The write side is untouched: `buildBoardFromSnapshot` still ignores `projects`, `views`,
  `showEmptyColumns` and `zoom`, and hardcodes `archived: false` on every card it builds.
  Round-tripping the new sections back into a doc is **U4**.
- Exported cards are in document iteration order, not sorted by `ord`. Sorting would make exports
  diff-friendly and replica-deterministic; deferred as a behavior change R1 does not ask for.
- Exported cards still carry the derived, display-only `shortId` (pre-existing; `parseJson` strips
  it on import).

---

## U3. Pure entity resolution

### What changed

- `packages/domain/src/io/resolve.ts` (new), re-exported from `io/index.ts`. It answers one
  question — _given the file's entities and the board's, what maps to what_ — and answers it with
  data, never a write. Public surface: `normalizeEntityName`, `resolveEntities`, `resolveImport`,
  and the types `ResolvableEntity`, `EntityFusion`, `EntityResolution`, `CardRefs`,
  `ResolvedCardRefs`, `DroppedRef`, `ImportResolutionInput`, `ImportResolution`.
- `packages/domain/src/io/resolve.test.ts` (new) — 47 tests.
- `packages/domain/src/ids.ts` — `slugify` gains an optional `maxLength` (default
  `SLUG_MAX_LENGTH = 60`, now exported). No existing caller changes.

### Why

- **Pure, in `domain`, not on the Yjs layer (KTD3).** The name rules are the part of import most
  likely to be wrong and hardest to eyeball, so they are provable without constructing a `Y.Doc`.
  This also keeps the `io/` split where `packages/domain` never imports `packages/sync`.
- **Structural input types, not snapshot types.** The board side is read out of Yjs by the caller
  and has no snapshot type; the file side does. Depending on neither lets `SnapshotProject` /
  `SnapshotLabel` / `SnapshotCard` be passed in unchanged, with generics preserving the concrete
  type on `create` so the caller still sees `color` and `ord`.
- **`slugify` reused with the cap lifted (KTD4).** A second normalization routine would be the
  second, divergent definition of "same name" that KTD4 exists to prevent. But `slugify` is built
  for decorative URLs and truncates at 60 characters, which would fuse two long names sharing a
  prefix. Parameterizing the cap — default unchanged — reuses the folding and drops the truncation
  only where names are _compared_.
- **Assignees are the caller's call.** R13 names labels, projects and related cards and pointedly
  omits assignees, and a pure function cannot know the board's member set. `board.memberIds` is
  optional: omitted, assignees pass through; supplied, an unknown assignee is dropped and reported.

### How it works

Per kind, in file order: **by id** (archived or not — an id match is an identity, not a revival, so
nothing about the board entity changes, R11); then **by normalized name** among non-archived board
entities only, where the board's entity survives with its own id, name, color and archived state
and the file's cards are repointed to it (R10), with the collapse pushed onto `fusions`; otherwise
**create**. `remap` is total over the file's ids, so one lookup answers any file id.

The candidate set **grows**: a created entity joins both indexes, so a second file entity
normalizing alike fuses into the first rather than reproducing the duplicate the rule exists to
prevent.

Two guards keep the fold honest. **Empty key** — `normalizeEntityName` returns `""` for names with
no Latin alphanumerics (non-Latin script, emoji, punctuation), and an empty key never enters the
name-match arm; otherwise every such name would read as "the same name" as every other. **No
truncation** — matching compares the whole normalized name, so two names sharing a 60-character
slug but differing after it stay distinct. Ties break deterministically on lowest `ord`, then `id`,
so the same file resolves identically on every replica.

Card references (R13) resolve through the remap first, then against ids already on the board
(archived included — relocating a card off an archived project would be the lifecycle change R11
forbids). Unresolvable references are dropped and reported; the card still imports. `labelIds`
de-duplicates, because a fusion can send two of a card's labels to one survivor. `ResolvedCardRefs`
deliberately carries no `archived` field: resolution decides ids, never lifecycle.

### How to test / verify

`pnpm --filter @boardly/domain test` — 204 tests, 47 of them in `src/io/resolve.test.ts`, with no
`Y.Doc` constructed anywhere in the unit's files. Every structural entity case runs twice, once per
kind, so "labels follow the project rules identically" is enforced rather than asserted.

Covered: id match leaves the board entity untouched and beats a name match; `"web  app"` fuses into
`"Web App"` and is reported; an archived-only name match creates instead; a still-archived file
entity may fuse into an active board entity; multi-way ties resolve to lowest `ord` then lowest
`id`, stable across repeated calls and a reversed board array; empty-normalizing names never fuse;
long names sharing a 60-character prefix do not fuse; two file entities normalizing alike fuse into
one target with both fusions reported; card refs repoint and de-duplicate; refs to archived board
entities survive; unresolvable refs are dropped and counted; assignees pass through without a
member list and are dropped with one.

### Follow-ups / known gaps

- Nothing calls `resolveImport` yet — **U4** owns the apply/write side.
- Whether the UI surfaces `fusions` and `dropped`, and in what words, is U5/U6's. The records carry
  both names and the shared normalized key, so a message can be written without re-deriving.
- `board.memberIds` has no caller yet; until one passes it, assignees import as-is.
- A fusion can collapse two of one card's labels into one. `labelIds` de-duplicates preserving
  first-occurrence order, and both entity-level fusions are still reported, so nothing is silent.

---

## U4. Three apply modes over a staged document

The unit's centre of gravity: the write path stops being a create-once builder and becomes three
explicit modes. This is where the silent no-op is actually fixed.

### What changed

- **`packages/sync/src/io.ts` (new, ~800 lines).** The whole snapshot **write** path, moved out of
  `board-doc.ts`. Exports:
  - `IMPORT_MODES` / `ImportMode` — `"replace" | "merge" | "copy"`, declared as a tuple so U5's
    command enum cannot drift from the modes that exist.
  - `applySnapshot(doc, snapshot, opts): ImportResult` — the one entry point.
  - `ImportResult`, `ImportCounts`, `StaleSkip` — the structured report (R17, KTD6).
  - `buildBoardFromSnapshot(doc, snapshot, now)` — kept as the pre-UNIT-21 entry point, now a thin
    call into `applySnapshot` in `replace` mode.
- **`packages/sync/src/board-doc.ts`** — `buildCard`, `maxTicketNumber` and
  `buildBoardFromSnapshot` removed; the file re-exports `buildBoardFromSnapshot` from `./io` so the
  existing import site keeps working. `boardToSnapshot` (the read path) stays: it is a selector like
  every other selector in that file.
- **`packages/sync/src/index.ts`** — exports `./io`.
- **The create-once guard is gone.** `if (meta.has("createdAt")) return;` no longer exists anywhere
  in the write path.

`packages/commands` and the UI are untouched — that is U5 and U6. `importBoard` still calls
`buildBoardFromSnapshot`, which now actually writes, in `replace` mode.

### Why

**The guard's precondition had been deleted underneath it.** It assumed import always targeted a
freshly created doc. Once the board became one doc per user, `ctx.getBoardDoc()` always returns a
doc carrying `createdAt`, so the guard fired on the first and only call and import did nothing at
all. Every test still passed because every test but one built into a `new Y.Doc()`. The one test
that did not — "is idempotent-guarded (won't overwrite an initialized doc)" — asserted the bug as
if it were the feature, which is why it was **replaced** rather than joined by a second test.

**The apply is staged in a detached `Y.Doc`, not wrapped in a transaction.** `doc.transact` is
`try`/`finally` with no `catch`: every write made before a throw stays committed _and_ propagates to
peers. A transaction buys single-update batching, not atomicity. So `applySnapshot` clones the live
doc into a detached one, runs the entire apply there, and only on clean completion encodes the
difference and applies it to the live doc. A throw discards the staging doc and the board never
moves (KTD8, R18, R25). The difference carries the delete set, which is how Replace's clear reaches
both the board and its peers. Recorded in
`docs/solutions/architecture-patterns/yjs-transact-has-no-rollback.md`.

**Ticket numbers are allocated, not written verbatim, on collision.** Repair-on-read
(`repairTicketNumbers`) resolves a duplicated number in favour of the earliest `(createdAt, id)`
card — which can be the _incoming_ one, renumbering a ticket the user already refers to. So an
incoming number is kept only when it is positive and free; otherwise a fresh one is allocated past
the highest in use (KTD5). Replace is exempt in practice because it empties the board first, so a
well-formed export round-trips its numbers exactly.

**Only Replace writes board identity.** Merge and copy pull content into the board the user is
already using; renaming it, or swapping its ticket prefix and badge row, is not something either
mode was asked to do. Replace does all of that, plus the file's saved views — but deliberately
_not_ `zoom` and `showEmptyColumns`, which are this device's display state rather than board
content (R6).

**Merge never modifies a matched project or label — only creates.** There is no per-entity
timestamp to adjudicate staleness the way R12 does for cards, so taking the file's name and colour
would let a stale export silently rename the user's project. This is the same survivor rule R10
already states for a name fusion, applied to an id match for the same reason. Cards do have
timestamps, so cards _are_ updated.

**Replace and copy resolve against the file's own entities, not against an empty board.** Both are
"create everything" modes, but running them through `resolveImport` with a genuinely empty board
would let two file projects whose names normalize alike fuse into one — losing a project on what is
supposed to be a verbatim restore. Passing the file's own entities as the candidate set means every
file entity id-matches itself: nothing fuses, and a reference to an id nothing in the file defines
is still detected and dropped (R13). Fusing is a merge rule, not a rebuild rule.

### How it works

```
applySnapshot(doc, snapshot, opts)
  ├── staging = new Y.Doc(); applyUpdate(staging, encodeStateAsUpdate(doc))
  ├── stage(staging, …)                    ← everything that can throw lives here
  │     ├── replace? clear cards + projects + labels        (KTD7 — the first hard delete)
  │     ├── resolveImport(file, board | file-as-board)      (U3)
  │     ├── copy? substitute a fresh id per kind            (R8)
  │     ├── projects → create | skip, ord generated if absent
  │     ├── labels   → create | skip, ord generated if absent
  │     ├── cards    → update | stale-skip | create
  │     ├── relations written symmetrically, after every card exists
  │     └── meta: shortIdSeq always; identity + views only on replace
  ├── update = encodeStateAsUpdate(staging, encodeStateVector(doc))
  └── doc.transact(() => applyUpdate(doc, update))          ← one update, or none
```

**Placement (R14).** One `OrdAllocator` per status, seeded with the highest `ord` already in that
status and advanced monotonically, so a run of new cards lands after existing content and keeps its
own order. Merge and copy always allocate — the file's keys mean nothing on this board. Replace
keeps the file's keys verbatim and only allocates for a card that has none (R23), folding each
verbatim key into the allocator so generated keys still sort after it. New cards are ordered by the
file's own `ord` where present, array order otherwise.

**Staleness (R12).** `card.updatedAt > 0 && card.updatedAt < board.updatedAt` skips, and records a
`StaleSkip` carrying the **board's** title plus both timestamps. A zero or absent `updatedAt`
carries no staleness claim and is applied — a hand-authored snapshot defaults to zero and would
otherwise never be able to update anything.

**Idempotence (R15).** Every scalar write on the update path goes through `setIfChanged`. A Yjs
`Map.set` always creates a new item even when the value is identical, so a naive rewrite would churn
the CRDT on every re-run. `updateCard` returns whether anything actually changed, and only then
stamps `updatedAt`. A second merge of the same file reports every card skipped and leaves the
document's content identical.

**Union, never delete (R7).** Labels, checklist items, links and relations are added when missing
and updated when present; nothing is removed. An empty incoming description never blanks the
board's. An existing card keeps its `archived` flag and `deletedAt` (R11), its `number` (KTD5), its
`createdAt`, and its placement unless its status moved — in which case it gets a fresh key in the
column it moved to.

**Assignees and provenance (R20).** `opts.userId` becomes the single-element `memberIds` list U3
already accepts, so an assignee who is not the importing user is dropped and reported like any other
unresolvable reference. `createdBy` is provenance and is carried verbatim.

### How to test / verify

`pnpm --filter @boardly/sync test` — 106 tests, up from 85. `pnpm -r typecheck` and `pnpm -r lint`
are green; `pnpm -r test` is 807 across the workspace with no other suite moved.

The anti-regression case is the renamed test in `src/io.test.ts`: **"writes into a doc that is
already initialized and already has cards"**. It seeds a real board, imports over it, and asserts
the board actually changed. It is the same test that used to assert the opposite.

Also covered: Replace leaves exactly the file's content with nothing pre-existing surviving; Replace
loads the file's views but preserves the device's `zoom`/`showEmptyColumns`; a v1 file (no views)
leaves the board's own in place; Replace keeps the board's `createdAt`. Merge adds, updates and
leaves alone in one pass; keeps the board's newer card and reports the stale skip with both
timestamps; applies a zero-`updatedAt` card; re-runs to an identical snapshot; fuses `"web app"`
into `"Web app"` and repoints the card; refuses to match an archived project by name; never flips a
project's `archived` in either direction; leaves a live card live against a file that archives it;
drops a dangling `projectId` and still imports the card; appends into each status in the file's
order against ords that would otherwise sort to the top. Plus: an assignee who is not the importing
user is dropped and `createdBy` survives; a snapshot with no `ord` anywhere builds in array order;
add-as-copy doubles the board with no id collisions and no fusions; no pre-existing ticket id
changes across a merge that collides on number _and_ has an earlier `createdAt`; `shortIdSeq`
advances so the next card created does not collide.

Two tests carry the atomicity claim. **"leaves the live doc byte-identical when the apply throws
part-way"** feeds a card with a malformed `ord` followed by one without, so the first is written
into staging and generating a key for the second throws inside `fractional-indexing` — a genuinely
half-written staging doc. It compares `Y.encodeStateAsUpdate` before and after rather than a few
fields, because a partial apply leaves structs a field-level check walks straight past.
**"lands the whole apply as a single update"** counts `doc.on("update")` firings and asserts one.

### Follow-ups / known gaps

- **Merge and copy do not import saved views.** A view's filter embeds project and label ids, and
  both modes remap those, so importing a view without rewriting its filter internals would produce
  a view that silently matches nothing. Only Replace loads views, which is the only case R6
  mandates. Rewriting filter values through the remap is the follow-up.
- **Merge never updates a matched project or label.** Deliberate (see Why), but it means a rename
  on the exporting board does not reach the importing one. A per-entity `updatedAt` in the snapshot
  would let the R12 staleness rule extend to entities and close this properly.
- **Import still writes no activity entry.** `appendActivity` exists and nothing on this path calls
  it, so the structured result stays the only record that an import happened. Replace additionally
  leaves activity rows pointing at cards it deleted.
- **The `ord` tie-breaker for generated keys is the constant `"import"`.** An import writes a
  contiguous run in one shot, so the suffix only has to separate it from a concurrent writer. Two
  devices importing the same file at the same instant would generate identical keys — they would
  still converge, just interleaved.
- Replace does not clear the activity log, and `shortIdSeq` is reset to the file's maximum, so a
  Replace can hand out numbers a deleted card previously used.
- U3's follow-up "nothing calls `resolveImport` yet" is closed by this unit; `board.memberIds` now
  has a caller.

---

## U5. Command layer: modes, parity, structured result

### What changed

- **`packages/commands/src/commands/io.ts`** — `importBoard`'s input gains a required, defaultless
  `mode` enum and an `acknowledgeReplace` literal, and it now returns U4's `ImportResult` instead of
  the board. `exportBoard`'s description was rewritten to say what the widened v2 format actually
  carries. `ImportError` is re-exported here so the REST layer can carry an import's own reason
  without taking a dependency on `@boardly/domain`.
- **`apps/server/src/routes/commands.ts`** — three changes: the generated catalog switches to
  `z.toJSONSchema(command.input, { io: "input" })`; a failed `importBoard` returns its own message in
  the 422 instead of a bare `"command failed"`; and the POST route carries an explicit
  `bodyLimit` (`COMMAND_BODY_LIMIT_BYTES` = 8 MiB) with a plugin-scoped error handler that turns
  Fastify's body-too-large error into a shaped 413.
- **`apps/web/components/board/import-export.tsx`** — passes `mode: "merge"` so the menu keeps
  compiling and stays non-destructive. The picker is U6.
- **`packages/sync/src/io.ts`** — Replace now _removes_ `icon` and `description` from board meta when
  the file carries none, instead of leaving the old value or writing an empty string. Found by U5's
  agent-path round-trip; see below.
- Tests: `packages/commands/src/catalog.test.ts` (+10), `apps/server/src/routes/commands.test.ts`
  (+6).

### Why

**One command with a required mode, not three commands (KTD1).** The validation boundary, the
atomicity guarantee and the result shape are identical across modes; only the apply branches. Three
commands would triplicate the largest input schema in the catalog — and that schema is inlined into
`GET /api/commands` and every MCP `ListTools` response, so the duplication is a recurring token cost
for no expressiveness.

**`mode` carries no zod default (R22).** `importBoard` already shipped accepting `{snapshot, title?}`
with no mode at all, so any default would silently reinterpret every existing agent call as a mode it
never chose — and the available default is the destructive one. Breaking those callers loudly is
correct: an omitted `mode` is now a 400 with the zod issue, before the doc is opened.

**The per-mode risk language lives in `.describe()`, because JSON Schema cannot hold the rule.**
`acknowledgeReplace` is `z.literal(true).optional()` plus an object-level `.refine()`. `.refine()` is
invisible to `z.toJSONSchema` — verified: the emitted schema advertises `acknowledgeReplace` as
`const: true` and drops the condition entirely. A discriminated union was rejected: it emits a
top-level `oneOf` with no properties, which the MCP tool builder flattens into a property-less
object. So the "replace requires acknowledgeReplace" rule is carried in the `mode` enum's
description, which `z.toJSONSchema` _does_ emit. This is the repo's first use of `.describe()`, and
it is the only mechanism that carries per-field guidance through the generated pipeline (R24).

**The catalog is generated in input mode.** Zod's default (output) mode lists every _defaulted_ field
as `required`, which would tell an agent it must supply `version`, `ord`, `priority` and every other
value the writer generates — inverting the authorable-snapshot promise (R23). With `io: "input"` the
snapshot's only required field is `board`.

**The body limit is route-scoped.** `apps/server/src/app.ts` builds one Fastify instance for every
route, so raising `bodyLimit` there would raise the ceiling for auth, tickets and unfurl too. 8 MiB
is roughly 4,000 richly-populated cards at ~2 KB of JSON each; Fastify's 1 MiB default is crossed in
the low hundreds, and the failure reaches the caller as an opaque error.

**A destructive call that fails with no reason invites a retry (R21).** An import that refuses now
says why, and says that nothing was written. The command wraps any non-`ImportError` throw from the
apply into an `ImportError` naming the mode, so the guarantee travels with the message. Every other
command's 5xx stays opaque — its message can carry internal detail.

**KTD10 restated, because it is the assumption that bites:** the UI confirmation dialog is not the
safety boundary. A program never sees it. Every guard that matters — required `mode`,
`acknowledgeReplace`, staged atomicity, the structured result — lives in the schema and the result.
And `acknowledgeReplace` is a deliberateness control, not a security one: a caller holding the bearer
token can already loop `deleteCard`, which is a hard delete exposed ungated.

### How it works

`importBoard.input` is a flat object with an object-level refinement, so validation order is: zod
parses the snapshot (the same `boardSnapshotSchema` the UI uses), then the refinement checks the
Replace acknowledgement — both before `ctx.getBoardDoc()` is ever called. The route's `safeParse`
runs before it opens the Hocuspocus direct connection, so a rejected call never touches the doc.

The return value is U4's `ImportResult` verbatim: `mode`, per-kind `{created, updated, skipped}`,
`fusions` (both names plus the file-id → board-id pair), `stale` (the board's title and both
timestamps), and `dropped`. All JSON-serializable, so REST and MCP get it unchanged. `archiveCards`
returning `{archivedIds, count}` is the existing precedent for a result-bearing command.

### How to test / verify

`pnpm --filter @boardly/commands test` — 61, up from 51. `pnpm --filter @boardly/server test` with
`DATABASE_URL` pointed at the dev Postgres — **69 passed, 0 skipped**, so the agent-path round-trip
was observed executing rather than skipped past. `pnpm -r test` is 860; `pnpm -r typecheck`,
`pnpm -r lint` and `pnpm -r build` are green.

```
docker compose up -d db
DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
  pnpm --filter @boardly/server test
```

Command-level: each of the three modes is accepted; an unknown mode and an omitted mode are both
rejected by zod with the board untouched; Replace without `acknowledgeReplace` is rejected before any
write; a malformed snapshot throws `ZodError`; a mixed create / update / stale-skip / dangling-ref
file produces counts that match what the doc actually gained; an apply that throws surfaces as
`ImportError` with the board unchanged. Four schema tests assert the generated contract directly:
`mode` required with no default and exactly three values, the description carrying
`acknowledgeReplace: true` and all three mode names, `acknowledgeReplace` as `const: true` and never
required, and the snapshot requiring only `board` under `io: "input"`.

Route-level: `GET /api/commands` advertises the same contract end to end; **export → mutate →
replace-import → export is deep-equal**, run against the caller's existing doc through the real
route — the exact condition the create-once guard turned into a no-op, and one an in-memory test
building into a fresh `new Y.Doc()` structurally cannot reach. Also: a merge over the live doc
reports its counts; an omitted mode and an unacknowledged replace are 400 while an acknowledged one
is 200; a failing import is a 422 carrying its own reason with the board unchanged; a body over the
limit is a 413 naming the limit.

That round-trip test earned its place immediately: it failed on the first run because Replace wrote
`description: ""` into a board whose meta had never carried one, so the second export was not equal
to the first. `boardToPlain` omits `icon` and `description` when meta has no value, so the write side
now deletes both keys when the file carries none. Nothing but a real round-trip through the route
would have caught it — the sync-level round-trip test seeds with `initBoard`, which always writes an
empty description.

### Follow-ups / known gaps

- **No `previewImport`.** Deferred with the plan: R22 already removes the dangerous-default trap that
  was its strongest argument, and sending the snapshot twice interacts badly with the body ceiling.
- **Markdown never reaches the command layer.** The UI parses Obsidian markdown client-side and only
  ever hands the command a parsed snapshot, so an agent cannot do what the UI can. A `format` + `text`
  variant, or a pure `parseBoardFile` command, closes this and the matching `exportMarkdown` gap.
- **`z.toJSONSchema(…, { io: "input" })` also drops `additionalProperties: false`.** Harmless here —
  zod strips unknown keys at parse time either way — but it means the advertised schema no longer
  tells a caller that extra keys are ignored.
- **Import still writes no activity entry**, so the structured result stays the only record.
- The 8 MiB ceiling is a number, not a streaming strategy. A board that outgrows it needs chunked
  transfer, which is the deferred item in the plan.

---

## U6. Import UI: mode picker, confirmation, result

### What changed

- **`apps/web/components/board/import-export.tsx`** — the Import menu item now parses the file and
  then opens a `Dialog` with three steps: the mode picker, the Replace confirmation, and the result
  panel. Three new sub-components (`ModePicker`, `ReplaceConfirmation`, `ImportReport`) live in the
  same file, as the rest of this component's helpers do.
- **`apps/web/components/board/import-export.test.tsx`** (new, 9 tests).
- **`docs/design/DESIGN.md` §7.6** — the mode choice, the destructive confirm, and the persistent
  result panel, as a binding pattern.

### Why

**The choice needs a dialog, not the popover.** The export popover is `w-56`, sized for a static
menu of one-line actions. Three modes each carrying a sentence of consequence do not fit, and
shortening the sentences is the wrong trade — the sentence _is_ the affordance (R24). The dialog is
the same primitive the confirmation uses, which `DESIGN.md` already maps modals to.

**Merge is shown disabled for markdown, not omitted (R9).** `parseObsidian` calls `newId()` for
every card on every parse, so merging the same markdown file twice adds a second copy of everything.
Omitting the option would read as a bug; the disabled row carries the reason in place of its effect
line, which is also the only place a user learns why their file is different.

**The result is a panel, not a toast (KTD6, R17).** `@boardly/ui`'s `toast` is a single
auto-dismissing string. The result carries lists — names joined by name, cards whose board version
was kept, dropped references — and it is the _only_ record that an import happened, since import
writes no activity entry. An auto-dismissing line cannot hold it, and a user who imports and sees
nothing move cannot tell success from the old no-op.

**Cancelling the Replace confirmation returns to the picker**, not out of the flow. The user
rejected one mode; they did not withdraw the file they just chose.

**All three steps share one `Dialog` with a step state**, rather than nesting a confirmation dialog
inside the picker dialog. Radix handles nesting, but focus restoration across two overlapping
modals is fiddly for no gain here: the steps are strictly sequential, and the confirm step still
renders the repo's exact irreversible-confirm markup at `max-w-sm`.

**KTD10 holds:** none of this is the safety boundary. A program never sees the dialog. The required
`mode`, `acknowledgeReplace`, the staged atomicity and the structured result — all in U5's schema —
are what actually protect the board.

### How it works

```
Import board…  →  parse (ImportError → inline alert in the popover, flow ends)
                       │
                       ▼
                  Dialog · ModePicker           file title + "N cards, N projects, N labels"
                       ├── Merge ───────────┐   (disabled + reason when the source is markdown)
                       ├── Add as copy ─────┤
                       └── Replace ──► Dialog · ReplaceConfirmation
                                            │   names both sides + the every-device warning
                                            ├── Cancel → back to the picker
                                            └── Replace board ──┐
                                                                ▼
                                                     Dialog · ImportReport (until Done)
```

The board-side counts in the confirmation come from `execute(exportBoard, …)`, run only when the
confirm step opens — the same snapshot the export menu produces, so the numbers cannot disagree with
what a Replace would actually remove. The file-side counts are read off the already-parsed snapshot,
which is why R16's "both sides, in real numbers" is affordable at all: nothing is written until the
mode is chosen, so the parse has already happened.

A parse failure keeps the existing inline `role="alert"` in the popover and never opens the dialog.
An _apply_ failure (a rejected snapshot, a malformed key) renders its message inside the picker,
because that is where the user is standing.

### How to test / verify

`pnpm --filter @boardly/web test` — 403, up from 394.

Covered: a JSON file offers three enabled modes, each showing its effect on existing content, above
the file's title and counts; a markdown file shows Merge **disabled with a visible reason** and the
other two enabled; a malformed file shows the inline alert and no picker; picking Replace opens a
confirmation naming both sides, the file's title and the every-device warning, and cancelling leaves
the board's cards untouched _and returns to the picker_; confirming runs the import and shows the
report; Merge and Add as copy run with no confirmation step, and Add as copy of a file whose card id
already exists on the board adds a third card rather than overwriting; the report names the cards
whose board version was kept, survives a tick (it is not a toast) and disappears on **Done**; a name
fusion is reported with both names and no id anywhere in the panel.

Keyboard: every step is buttons in DOM order inside a Radix `Dialog`, so Tab cycles within the
modal, Escape closes it, and focus returns to the export trigger. Focus rings are the §5
`focus-visible:ring-2 ring-[var(--accent)]` used on the existing menu items.

### Follow-ups / known gaps

- **No dark-mode screenshots yet** — U7 captures the picker and the confirmation.
- **The result panel does not name dropped references individually**, only their count. The records
  carry the card id and the field, so naming them means a lookup the panel does not do today.
- **The picker acts on click rather than being a radio group with a confirm.** One click per
  non-destructive mode is the cheaper path, and Replace still has its own gate. If a fourth mode
  ever lands, revisit.
- **Markdown import still goes through the client-side parser only**, so the mode choice exists in
  the UI and not for an agent importing markdown. That gap is U5's `parseBoardFile` follow-up.
- The board-side counts are read at confirm time and not re-read if the board changes while the
  dialog is open. A sync from another device during the confirmation would make them stale by the
  time Replace runs.

---

## U7. End-to-end coverage and the dark-mode check

### What changed

- **`apps/e2e/tests/import-export.spec.ts`** (new, 6 tests) — the whole flow in a browser, against a
  real server and Postgres.
- **`apps/e2e/fixtures/`** (new) — `board-v2.json`, `board-v1.json`, and a README saying why they are
  hand-written.
- **`apps/e2e/global-setup.ts`** (new) — refuses to start the suite when `apps/web/out` was built
  against a different API origin. See "What this unit found" below; it is not incidental.
- **`apps/e2e/playwright.config.ts`** — wires that global setup.
- **`docs/units/screenshots/UNIT-21-import-modes-dark.png`**, **`UNIT-21-replace-confirm-dark.png`**.
- **`apps/web/components/board/import-export.tsx`** — the Replace confirmation is two short sentences
  instead of one long one; the dark capture showed the old one wrapping badly around the file title.
- **`packages/sync/src/board-doc.ts`** — `boardToSnapshot` now sorts its `cards` array, like it
  already sorted `projects` and `labels`. Found by the U5 round-trip test failing intermittently:
  a `Y.Map`'s iteration order is its internal key order, and a Replace clears the map and writes
  every card back, which permutes it. Two exports of the same board could differ, and
  `export → replace → export` could come back unequal, for no reason but key layout. Sorted by
  `(ord, id)` — `id` breaks the tie two replicas can produce concurrently. `io.test.ts` gained the
  regression case.

### Why

**The fixtures are hand-written and stay hand-written.** They are the interchange contract. A
fixture regenerated from `exportBoard` would silently track whatever the exporter currently emits,
so the v1 file would stop being a v1 file the moment the format moved again — which is the exact
regression `board-v1.json` exists to catch (R2, AE6).

**Export → merge-the-file-straight-back is the sharpest available proof of R15.** It needs no
fixture, no arranged staleness, and no knowledge of the board's contents: whatever the board is, the
file describes it exactly, so a correct merge must report every card left alone and change nothing.

**The baselines are scoped to the dialog, not the page.** The repo's usual full-page
`maxDiffPixelRatio: 0.03` cannot see a rewritten sentence inside a 400px dialog — the changed pixels
stay far under the threshold, so a stale baseline keeps passing. That is not hypothetical: the first
capture of the confirmation kept passing after its copy was rewritten. A dialog-scoped baseline at
0.01 catches it, and the dialog is what `DESIGN.md` §7.6 actually describes.

### How it works

The spec drives the real component: it opens the export popover and hands the hidden `input[type=file]`
a path, exactly as the browser would — `setInputFiles` works through `class="hidden"`, so no click on
"Import board…" (which would open the OS picker) is needed.

Two locator facts are worth keeping, because both produced confusing failures:

- **A Radix `Popover` is also `role="dialog"`,** and `dnd-kit` renders its own `role="status"` live
  region on every board page. Both the report and the picker have to be located with that in mind —
  the report is `getByRole("dialog").getByRole("status")`.
- **A modal removes the board from the accessibility tree.** Radix marks the dialog's siblings
  `aria-hidden`, so "cancelling left the board alone" can only be asserted with the dialog closed —
  `getByRole` finds zero cards while it is open, which reads exactly like the cards being gone.

### What this unit found

**The e2e suite had been running against the production stack.** `NEXT_PUBLIC_API_URL` is inlined at
build time, and `apps/web/.env.production` — auto-loaded by `next build` — points it at
`http://localhost:8788`, the Dockerized production backend. So any ordinary `pnpm -r build` before an
e2e run produces an `out/` that talks to production while Playwright starts an unused e2e server on 8787. Nothing looks wrong: the server boots, the browser connects, tests sign up and pass. This
session created 38 accounts and 17 board documents in the production database before a rate-limit
mismatch exposed it (the e2e server lifts the login limit to 1000; production keeps 5, and
`api-client.ts` renders every non-ok auth response as "invalid email or password", 429 included).

Those rows were deleted. `apps/e2e/global-setup.ts` now scans the emitted chunks and refuses to start
when `out/` names a `:87xx` origin other than 8787, printing the rebuild command. Full write-up:
`docs/solutions/test-failures/e2e-ran-against-the-production-stack.md`.

### How to test / verify

```
docker compose up -d db
NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm --filter @boardly/web build
pnpm --filter @boardly/server build
pnpm --filter @boardly/e2e e2e
```

The new spec is 6 tests, all green; `pnpm -r test` is 870. The whole suite is **37 tests, 36 passing**; the one failure is
`sync.spec.ts` "a card created on one client appears on another", which passes on its own — a
second-client websocket timing out at the tail of a 37-test single-worker run, unrelated to this
unit.

Covered: export then merge the file straight back reports every card left alone and adds nothing;
merging `board-v2.json` into a board holding "Web app" creates "Mobile", fuses "web app" into the
board's project, and leaves exactly one "Web app" in the sidebar; Replace shows a confirmation naming
both sides and the file's title, cancel returns to the picker and leaves the board intact, confirming
loads the file and leaves the device's zoom alone even though the file asks for 1.5; `board-v1.json`
imports with no project in the sidebar, and the flow raises no console error and no failed request.
Both dialogs are captured in dark mode.

### Follow-ups / known gaps

- **The suite is still one shared server and one database with `workers: 1`,** so a spec's cost is
  the whole suite's. The 36/37 flake above is that shape showing through.
- **No e2e for Add as copy.** It is covered at the unit and component level; the browser adds nothing
  the other two modes do not already prove about the dialog.
- **No e2e for the markdown-disabled Merge row** (R9) — component-level only, because the flow needs
  a markdown file and the assertion is a disabled attribute, which the browser does not make more
  convincing.
- `apps/e2e` remains outside `pnpm -r test`, so nothing runs it on the way to a commit.
