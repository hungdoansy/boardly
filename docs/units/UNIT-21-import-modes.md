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
