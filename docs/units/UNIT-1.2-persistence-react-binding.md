# UNIT 1.2: `packages/sync` — local persistence & React binding

- **Plan unit:** 1.2 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1)
- **Status:** done
- **Requirements:** R1 (offline-first), R2 (performant, scoped re-renders)
- **Commit(s):** _this unit's commit_

## What changed

Offline persistence via `y-indexeddb` and a `useY` hook so React re-renders on scoped Yjs changes.
No network provider yet (Phase 3).

- `packages/sync/src/persistence.ts` — `attachIndexedDb(doc, room)` → `{ persistence, whenSynced }`
  (whenSynced resolves once hydrated from IndexedDB), and `requestPersistentStorage()` (one-shot
  `navigator.storage.persist()`, safe no-op off-browser).
- `packages/sync/src/provider.ts` — a per-room doc **registry**: `getBoardDoc(boardId)` /
  `getWorkspaceDoc(userId)` / `getDoc(room)` return a cached `DocHandle` (`{ doc, room, whenSynced,
destroy }`). Rooms: `boardly:board:{id}` / `boardly:workspace:{userId}` (== the Phase-3 sync-server
  room). Caching guarantees the UI and all mutations share one in-memory doc.
- `packages/sync/src/use-y.ts` — `useY(target, selector, options?)` built on `useSyncExternalStore`.
  Exposed via the new `@boardly/sync/react` subpath (kept out of the main barrel so the non-React
  server doesn't pull React).
- `packages/sync/src/index.ts` — now also re-exports persistence + provider.
- Tests: `persistence.test.ts` (2, node + fake-indexeddb), `use-y.test.tsx` (2, jsdom).
- Deps: `y-indexeddb 9.0.12` (sync); `react`/`react-dom` become sync peer+dev deps;
  `@testing-library/react 16.3.2` + `@testing-library/dom 10.4.1` added to root devDeps.

## Why (decisions)

- **Doc registry (one doc per room).** `useY` and the command layer must observe/mutate the _same_
  `Y.Doc`; a registry keyed by room enforces that and is where the Phase-3 websocket provider will
  attach (noted inline). `destroy()` tears down persistence + doc and evicts the entry.
- **React binding on a separate entry (`@boardly/sync/react`).** `use-y.ts` imports React; keeping it
  off the main barrel means `apps/server` can `import "@boardly/sync"` without React entering its
  graph. Web imports the hook from `@boardly/sync/react`.
- **`useY` snapshot caching.** `useSyncExternalStore`'s `getSnapshot` must return a stable reference
  when nothing changed, or a selector that builds a fresh array/object each call loops forever. The
  hook caches the last value and only swaps it when the selector result actually differs (`Object.is`
  or a supplied `isEqual`) — recomputed **inside the observe handler**, not on every render. This
  also gives scoping: subscribe to one Y type (a card's map) and unrelated changes never fire.
- **`deep` option** exposes `observeDeep` for callers that need nested changes; default is shallow
  `observe` (cheapest, most scoped).
- **Structural `YObservable` type** (not `any`, not Yjs's generic `AbstractType`) sidesteps
  Y-event generic-variance friction while accepting Y.Map/Y.Array/Y.Text.

## How it works

`getBoardDoc(id)` → registry hit or `new Y.Doc()` + `attachIndexedDb` + `requestPersistentStorage()`.
Startup order for the app (later units): create doc → attach IndexedDB → `await whenSynced` → render.
`useY` subscribes via the doc type's `observe`/`observeDeep`, recomputes the selector on change, and
re-renders only when the result differs.

## Design (UI units)

N/A — infrastructure. Enables the board-list rail (1.3) and board view (1.4/1.5) to render live Yjs
state with scoped updates (R2 perf).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"` then `pnpm --filter @boardly/sync test`
(16 total; 4 new):

- **Persistence round-trip** (node + fake-indexeddb) — write columns to a doc, let the store settle,
  attach a **fresh** doc to the same room, `await whenSynced` → the column is there.
- **Empty hydrate** — a doc with no prior state resolves `whenSynced` and reads empty, no error.
- **`useY` scoping** (jsdom via `// @vitest-environment jsdom`) — observing card A: a change to card B
  does **not** re-render; a change to A does, with the new value.
- **Stable snapshot** — repeated renders return the same reference when nothing changed (no loop).

Full gates: `pnpm turbo run typecheck` (6/6), `lint` (6/6), `test` (domain 15 / sync 16 / ui 2),
`format:check` clean.

## Follow-ups / known gaps

- **Network (websocket) provider** attaches in Phase 3 (U3.6) at the registry seam; nothing here
  changes then except an added provider.
- **Unit 1.7 (command layer) is built next** per the plan's build order; UI units 1.3+ route writes
  through it and read via `useY`.
- Real-browser IndexedDB durability is covered by Playwright later (unit tests use fake-indexeddb per
  the plan's execution note).
