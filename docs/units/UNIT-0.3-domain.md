# UNIT 0.3: `packages/domain` — types, enums, pure helpers

- **Plan unit:** 0.3 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 0)
- **Status:** done
- **Requirements:** R6, R7, R8
- **Commit(s):** _this unit's commit_

## What changed

The framework-agnostic domain vocabulary and pure functions shared by every app/package. No React,
no DOM, no Yjs.

- `packages/domain/src/enums.ts` — `Priority` (None/Low/Medium/High/Urgent → 0–4), `Severity`
  (S1–S4 → 1–4, `null` when unset), `LinkProvider` (slack/linear/claude/generic). Modeled as
  `const` objects + derived union types (not TS `enum`) so they tree-shake, are
  `isolatedModules`-safe, and serialize as plain JSON. Name-lookup tables (`PRIORITY_NAMES`,
  `SEVERITY_NAMES`) included.
- `packages/domain/src/ids.ts` — `Id` type, `newId()` (Web Crypto `randomUUID`), `formatShortId`,
  `parseShortId` (regex-validated, `null` on malformed).
- `packages/domain/src/links.ts` — `detectProvider(url)` and `shortLabelFor(url, provider?)`. URL
  parsing is wrapped so malformed/relative input falls back to `generic` and never throws.
- `packages/domain/src/ordering.ts` — fractional-index helpers over the `fractional-indexing`
  package: `keyBetween(a, b, clientId)`, `fracOf`, `compareOrd`, `byOrd`.
- `packages/domain/src/types.ts` — plain-TS mirrors of the Yjs shape: `Board`, `Column`, `Card`,
  `Label`, `ChecklistItem`, `CardLink`, `DueDate`, `WorkspaceBoardRef`. These are the
  JSON-serializable shapes the command layer will return.
- `packages/domain/src/index.ts` — barrel re-export.
- Tests: `ids.test.ts`, `links.test.ts`, `ordering.test.ts` (15 cases).
- `package.json` — added `fractional-indexing 4.0.0` (exact). Dropped the `build` script from the
  source-consumed libraries (`domain`/`sync`/`ui`) — see decisions.

## Why (decisions)

- **`const` objects over `enum`.** `verbatimModuleSyntax` + `isolatedModules` make TS `enum`
  awkward, and const objects give literal union types that serialize cleanly for the agent/REST
  surface.
- **Severity is `1–4 | null`, not `0–4`.** The plan sketch says "0–4|null" loosely; representing
  "no severity" as `null` (not a magic `0`) makes "a card with no severity renders no badge"
  unambiguous.
- **Composite `ord = <fractional-key>-<clientId>`.** A reorder is a single `ord` write (never an
  array rewrite — the Focalboard lesson + Yjs move-duplication pitfall). The `clientId` suffix is a
  tie-breaker so two clients inserting between the **same** neighbors (concurrent offline insert)
  produce **different** keys that both still sort strictly between those neighbors — the replicas
  converge on one deterministic total order. `-` (0x2D) is the separator because it sorts **lower**
  than every char in the `fractional-indexing` alphabet (`0`–`z`), so plain lexicographic compare
  yields "fractional key first, then clientId" without special-casing. `keyBetween` strips each
  neighbor to its fractional part before calling `generateKeyBetween`, then re-tags.
- **`newId` uses `globalThis.crypto.randomUUID()`** (not `node:crypto`) to stay platform-agnostic —
  it resolves on Node 20+ and in browsers; `@types/node` types the global so no DOM lib is needed in
  `domain`.
- **`status` is deliberately absent from `Card`.** Workflow status (`status.ts`, enum + categories)
  is Unit 2.12; adding it here would front-run that unit. `Card` gains `status` then.
- **No `build` script for `domain`/`sync`/`ui`.** Their `package.json` `exports` point at
  `./src/index.ts`; bundlers (Next/Vite) and `tsc` consume the TypeScript source directly, so a
  `dist/` emit is unused — and emitting compiled `*.test.js` into `dist/` produced a stale-sourcemap
  warning. `typecheck` (`tsc --noEmit`, which still includes the test files) is the validation gate;
  apps keep their real `build`.

## How it works

`detectProvider` matches on hostname (`*.slack.com`, `linear.app`, `claude.ai`); `shortLabelFor`
switches on the provider — Linear pulls `ABC-123` out of the path via `/([A-Z][A-Z0-9]+-\d+)/`,
Slack archive links become `msg →`, Claude becomes `session →`, and generic links show the
`www.`-stripped hostname. Ordering: see the composite-key decision above; `byOrd` is the selector
comparator later used by `@boardly/sync`.

## Design (UI units)

N/A — no UI. These helpers feed the badge row (2.3/2.4), link chips (2.7), and short-id display
(2.8) later.

## How to test / verify

Prefix commands with `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- `pnpm --filter @boardly/domain test` — 15 tests:
  - `ids` — `formatShortId`/`parseShortId` round-trip; malformed → `null`; `newId` unique + uuid-shaped.
  - `links` — Slack/Linear/Claude/generic detection; malformed/relative → `generic` (no throw);
    Linear id extraction; compact Slack/Claude labels; generic hostname (www-stripped).
  - `ordering` — first key from `(null,null)`; strictly-between; **two-client tie-breaker** (different
    keys, both between); repeated same-gap inserts stay ordered; `byOrd` sorts.
- `pnpm turbo run typecheck` (6/6), `pnpm turbo run lint` (6/6), `pnpm format:check` clean.

## Follow-ups / known gaps

- `LinkProvider` ships the base set; **GitHub PR/issue** providers and the full one-file-per-provider
  registry (`links/registry.ts`, `links/providers/*`) arrive in Unit 2.7, layered over
  `detectProvider`/`shortLabelFor`.
- `Card.status` + `status.ts` (enum, categories, transitions) arrive in Unit 2.12.
- Fractional-key rebalancing (for pathological key growth) is deferred until real reorder volumes
  exist (plan Open Questions).
