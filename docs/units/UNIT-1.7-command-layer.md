# UNIT 1.7: Command layer & agent-native seam (`packages/commands`)

- **Plan unit:** 1.7 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 1; built
  right after 1.2 per the plan's build order)
- **Status:** done
- **Requirements:** R13 (agent-native parity)
- **Commit(s):** _this unit's commit_

## What changed

A single typed, zod-validated catalog of board/card operations, executable both client-side (UI) and
server-side (REST/MCP) against the **same** command definitions — the seam that guarantees the agent
surface cannot drift from the UI.

New package `packages/commands`:

- `src/context.ts` — `CommandContext` interface (`getBoardDoc`/`getWorkspaceDoc`/`clientId`/`now`/
  `userId`) + `createMemoryContext()` (in-memory, no persistence — used by tests/headless callers).
- `src/command.ts` — `Command<S, O>` (`{ name, description, input: ZodSchema, run(ctx, input) }`),
  `defineCommand`, and `execute(command, ctx, rawInput)` (zod-validates then runs).
- `src/commands/{board,column,card,status,link,search}.ts` — the commands. Each wraps a
  `@boardly/sync` accessor, validates input with zod, and returns a JSON-serializable result.
- `src/catalog.ts` — `commands` array + `catalog` record + `getCommand`/`listCommandNames` (REST/MCP
  will enumerate this and derive schemas from each `input`).
- `src/client-context.ts` — `createClientContext()` backed by the sync provider registry; exposed at
  the `@boardly/commands/client` subpath (keeps IndexedDB/React off the server graph).
- `src/index.ts`, `package.json` (zod 4.4.3), `tsconfig.json`, `vitest.config.ts`; added to the root
  `vitest.config.ts` projects.

Supporting additions seeded here (the plan's 1.7 test scenarios reference `setCardStatus` + `addLink`):

- `packages/domain/src/status.ts` — minimal `Status` enum (6 values) + `DEFAULT_STATUS`. **Card**
  type gains `status`. (Categories/colors/transitions/activity are Unit 2.12.)
- `packages/sync` — `addCard` now defaults `status`; `cardToPlain` reads it; new accessors
  `setCardStatus`, `addLink`, `removeLink`.
- **`@boardly/sync` barrel split**: the main entry is now pure (schema + accessors); browser-only
  `persistence`/`provider` moved to `@boardly/sync/client`. This keeps DOM out of the command
  layer's (and the future server's) type graph.

## Why (decisions)

- **Context abstracts the doc, commands are written once.** `run(ctx, input)` never knows whether it
  is client or server; the only difference is what `ctx.getBoardDoc` returns (a persisted local doc
  vs a Hocuspocus direct connection in Unit 3.9). This is the agent-native seam (R13).
- **`now`/`clientId` injected via the context** → deterministic commands, which is what makes the
  parity test meaningful (identical inputs → byte-identical logical state).
- **Method-syntax `run`** on the `Command` interface makes specific commands assignable to the erased
  `Command` type, so `commands satisfies Command[]` and the catalog type-check cleanly.
- **zod 4** for validation — its built-in `z.toJSONSchema` will feed REST/MCP schema derivation
  (Units 3.9/3.10) with no extra dependency.
- **Barrel split (see above)** was forced by cross-package **source** consumption: importing
  `@boardly/sync` was dragging `navigator`/IndexedDB types into the DOM-free `commands` graph. Pure
  main barrel + `/client` subpath is the clean, durable fix and pre-empts the same issue for the
  server.

## Design (UI units)

N/A — no UI. This is the write path Units 1.3–1.6 and all of Phase 2 must call instead of touching
`@boardly/sync` accessors directly (enforced by review + the parity principle).

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`; `pnpm --filter @boardly/commands test`
(4 tests):

- **Catalog** — every command registered uniquely by name; `getCommand` resolves.
- **Core mutations (client ctx)** — `createBoard`/`addColumn`/`createCard`/`renameColumn`/
  `setCardStatus`/`addLink`/`moveCard` mutate correctly; results are JSON-serializable; short id
  `BRD-1`; link provider auto-detected (`linear`).
- **Invalid input** — empty-title `createCard` throws `ZodError` **before** any mutation (card count
  unchanged).
- **Parity** — a client context and a server-style context run the identical command script and
  produce **identical** board state (`getBoard` + `liveColumns` + `cardsInColumn` deep-equal). This
  is the proof that the agent path and the UI path cannot diverge.

Full gates: `pnpm turbo run typecheck` (7/7), `lint` (7/7), `test` (domain 15 / sync 16 / commands 4
/ ui 2), `pnpm --filter @boardly/web build` (static export valid), `format:check` clean.

## Follow-ups / known gaps

- **Label commands** (`commands/label.ts`) are deferred to Unit 2.2, where the label data layer + UI
  are built; they join the catalog there (with their own parity coverage). Noted in the plan.
- The **server context** (Hocuspocus direct connection) is Unit 3.9; `createMemoryContext` stands in
  for it in the parity test today.
- REST/MCP schema derivation from `command.input` (via `z.toJSONSchema`) lands in Units 3.9/3.10.
- `status`/`link` here are minimal; Unit 2.12 (status categories/activity) and Unit 2.7 (link
  registry incl. GitHub, unfurl, URL de-dup) enrich them — both continue to route through this layer.
