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
