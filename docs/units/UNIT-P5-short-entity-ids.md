# UNIT-P5 — Short entity ids & `<id>-<slug>` project URLs

Replace uuid entity ids with short, URL-friendly ids, and format project URLs as
`<id>-<slug>` (mirroring ticket refs) so scoped-board URLs read cleanly instead
of `#p/668c4991-c5f4-4173-96c5-96eaa444aa19`. Requested interactively.

## What changed

**Short ids — `packages/domain/src/ids.ts` `newId`**

`newId()` now returns an **8-char lowercase base36** token (was uuid v4) via Web
Crypto, with rejection sampling (bytes ≥ 252 dropped) so the modulo is unbiased.
This shortens ids for **every** entity that uses `newId` — projects, cards,
labels, checklist items, links. Ids are validated as `z.string()` at the command
boundary (never `.uuid()`), so nothing downstream needed to change. 36⁸ ≈ 2.8e12
keeps collisions negligible for a personal board, even under offline CRDT merges.
Ids are intentionally **hyphen-free** so an `<id>-<slug>` ref parses back to the
id at the first hyphen.

**Project URL refs — `packages/domain/src/ids.ts`**

New `formatProjectRef(id, name)` → `"<id>-<slug>"` (slug cosmetic, dropped when
empty) and `parseProjectRef(ref)` → the id (everything up to the first hyphen).
Same shape and semantics as `formatTicketRef`/`parseTicketRef`: resolution is by
id, so a renamed project still opens from a stale URL.

**Routing — `apps/web/lib/route.ts`**

`Route` now carries both `projectRef` (the raw `<id>-<slug>` segment, for
rebuilding the hash) and `projectId` (resolved via `parseProjectRef`, for
lookup). `buildBoardHash` takes the raw `projectRef` so the slug survives across
card open/close. `apps/web/lib/use-boards.ts` `writeCardHash` / card-close now
thread `projectRef` (not the bare id).

**Sidebar — `apps/web/components/board/project-list.tsx`, `lib/use-projects.ts`**

Clicking a project navigates to `formatProjectRef(project.id, project.name)`.
`ProjectActions.create` now returns the created `Project` (not just its id) so
the caller can build the slugged ref for the new project. Active-row matching is
still by resolved `projectId`.

**Seed / data** — no seed *code* change: the script already mints ids through
`newId`/`addProject`/`addCard`, so short ids flow through automatically. The demo
account's Postgres doc was wiped and rebuilt (`SEED_RESET=1`) so existing uuid
ids are replaced with short ids.

## Why

The uuid project id was the ugly part of the new project-scope URLs (Unit P4).
Short ids make every URL compact, and the `<id>-<slug>` project ref matches the
existing ticket-ref convention exactly, so the two link formats are consistent
and both tolerate stale slugs.

## How to test/verify

- **Unit** — `packages/domain/src/ids.test.ts`: `newId` produces unique,
  hyphen-free `[0-9a-z]{8}` ids (100-sample uniqueness); `formatProjectRef` /
  `parseProjectRef` slug + round-trip + stale-slug resolution.
  `apps/web/lib/route.test.ts`: `<id>-<slug>` parsing, bare-id fallback, and the
  `projectRef`/`projectId` split. `project-list.test.tsx`: clicking a project
  navigates to `#p/<id>-<slug>`.
- **Suite** — domain 93, sync 48, commands 25, web 176, server 26 (36 skipped) —
  all green; `tsc --noEmit` and `eslint` clean.
- **Manual (dark mode, demo account, reseeded)** — clicking **Web app** →
  `#p/0y4cm9vm-web-app` (8-char id + slug), board filtered to its 7 cards, only
  Web app active; opening a card → `#p/0y4cm9vm-web-app/BRD-3-design-the-mobile-card-layout`
  (scope + slug preserved).

## Follow-ups / known gaps

- Short ids trade a sliver of uniqueness headroom vs uuid; ample for this app's
  scale. If entity counts ever grow by orders of magnitude, bump `ID_LENGTH`.
- Old exported data / URLs that embedded uuids won't resolve after the reseed
  (acceptable: the DB was intentionally wiped).
