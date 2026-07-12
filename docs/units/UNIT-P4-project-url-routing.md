# UNIT-P4 — Project scope as a URL route (All & projects are real nav items)

Make the sidebar's **All** and each **project** first-class, linkable nav
destinations backed by the URL hash, and make the project list and the Settings
view mutually exclusive for the "active" highlight. Requested interactively.

## What changed

**New hash grammar — `apps/web/lib/route.ts` (new)**

A single, centralized grammar for everything the workspace can be "at" (static
export → the hash is the only routing surface):

| Hash                         | Meaning                          |
| ---------------------------- | -------------------------------- |
| `` (empty)                   | board, All projects              |
| `p/<projectId>`              | board, scoped to a project       |
| `<ticketRef>`                | All projects, a card open        |
| `p/<projectId>/<ticketRef>`  | project scope **and** a card open |
| `settings`                   | Settings view (global)           |

`parseRoute(hash) → { settings, projectId, ticketNumber }`, `buildBoardHash`,
`currentHashBody`, `writeHashBody`, and `subscribeRoute` live here. A ticket ref
never contains `/` (slugs collapse non-alphanumerics to hyphens), so `/` is a
safe separator and `p` is a reserved first segment (real refs are `PREFIX-N-slug`,
never the bare token `p`).

**Project scope is now URL-backed — `apps/web/lib/use-projects.ts`**

`useSelectedProject` / `getSelectedProject` / `setSelectedProject` no longer use
a module variable; the hash is authoritative. `setSelectedProject(id)` navigates
to a fresh project board (`p/<id>` or ``), which inherently drops any open card
and exits Settings. `getSelectedProject()` (used by the create-card command
handler in `use-board.ts`) reads the scope from the current hash.

**One synchronous route notifier — `route.ts` `subscribeRoute`**

jsdom (and some browsers) fire `hashchange` asynchronously, which would let the
route hooks tear apart mid-interaction (e.g. Settings opens but the project row
stays lit for a tick). `writeHashBody` notifies a shared listener set
synchronously on every in-app write, and `subscribeRoute` also forwards
browser back/forward `hashchange`. All three route hooks
(`useSelectedProject`, `useSettingsRoute`, `useSelectedCard` via
`useHashTicketNumber`) are `useSyncExternalStore(subscribeRoute, …)`, so an
in-app nav updates them all in the same commit.

**Card open preserves scope — `apps/web/lib/use-boards.ts`**

`writeCardHash` and the card-close path now keep the current project segment, so
opening a card while scoped to a project produces `p/<id>/<ref>` and closing it
returns to `p/<id>` (not All). `useSettingsRoute` and `useHashTicketNumber` were
converted from `useState`+`useEffect` to `useSyncExternalStore`.

**Settings ↔ project mutual exclusivity — `apps/web/components/board/project-list.tsx`**

`ProjectList` reads `useSettingsRoute()`; while Settings is open, `activeId` is
forced to `undefined` so neither **All** nor any project reads as active.
Clicking any row calls `select(...)` → `setSelectedProject(...)`, which writes a
`p/<id>` (or ``) hash — from Settings this navigates straight back to that
board.

## Why

Project scope used to be module state, invisible to the URL: it wasn't linkable,
it survived into the Settings view (so a project stayed highlighted there), and
there was no "navigate to this project" affordance from Settings. Making scope a
route fixes all three and gives back/forward navigation for free. The card
segment is nested under the project segment so the scoped board is preserved
while a card is open — closing the card lands you back where you were.

## How it works

The hash is parsed once by `parseRoute`; every route hook derives its slice from
it and re-renders on the shared notifier. Writers only ever call `writeHashBody`,
which dedupes (no spurious history entries) and fans out synchronously.

## How to test/verify

- **Unit** — `apps/web/lib/route.test.ts` (new): grammar round-trips, prefix/slug
  tolerance, and the `p`-vs-ticket-ref disambiguation.
  `apps/web/components/board/project-list.test.tsx`: new case asserts no row is
  active while Settings is open and that clicking a project from Settings
  navigates to `#p/p1`. Existing `use-boards.test.tsx`, `workspace-app.test.tsx`,
  `search`/`palette` deep-link tests still pass.
- **Suite** — `pnpm --filter @boardly/web exec vitest run` → 175/175; `tsc
  --noEmit` clean; `eslint` clean.
- **Manual (dark mode, demo account)** — verified live: clicking **Web app** →
  URL `#p/<id>`, board filters to 7 Web-app cards, only Web app active; opening
  **Settings** → `#settings`, Settings pressed, **no** project active; clicking
  **Platform** from Settings → `#p/<id>`, board returns filtered to Platform;
  opening a card while scoped → `#p/<id>/<ref>` (scope preserved); **All** →
  empty hash, full board.

## Follow-ups / known gaps

- ~~Project hash segments use the raw project id (uuid), not a slug.~~ Resolved
  in UNIT-P5: ids are short and project URLs are `p/<id>-<slug>`.
- Closing Settings via ESC/× returns to All (empty hash), not the
  previously-scoped project. Acceptable; the primary "leave Settings" path is
  clicking a project. Restoring the prior scope would need history/back or a
  remembered segment.
