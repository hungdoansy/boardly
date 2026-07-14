# UNIT 10.3: Optimistic link add + async title enrichment

- **Plan unit:** Unit 3 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R6 (a pasted link adds immediately; a slow/failed unfurl never blocks or drops it)
- **Dependencies:** none

## What changed

- **`apps/web/lib/use-board.ts`** — `useLinkActions.add` now **persists the link first**, then
  enriches its title in the background. `execute(addLink, …)` runs synchronously (before the
  first `await`), so the chip appears at once with the host label; the generic unfurl (or bare
  GitHub-repo description fetch) runs afterward and, on success, calls `updateLinkTitle`. Known
  providers still skip the network entirely. The `add` signature is unchanged (`Promise<void>`).
- **`packages/commands/src/commands/link.ts`** — new `updateLinkTitle` command
  (`{ cardId, linkId, title }`), registered in `packages/commands/src/catalog.ts` so REST/MCP
  expose it too (agent-native parity).
- **`packages/sync/src/board-doc.ts`** — new `setLinkTitle(doc, cardId, linkId, title, now)`
  (via `withCard`); a no-op if the card/link was removed meanwhile.
- **Tests:** `packages/commands/src/commands/link.test.ts` (title set; no-op after remove),
  `apps/web/lib/use-board-links.test.tsx` (link present before unfurl resolves; title patched on
  resolve; link kept with no title on failure; known providers don't unfurl).

## Why

- **The bug was latency, not validation.** `unfurl()` already swallows its errors and returns
  `null` (it never throws), so the add wasn't being _aborted_ — it was being _serialized behind_
  the unfurl round-trip. A slow or hung `/api/unfurl` (e.g. the pasted Zoho Recruit URL) left the
  link invisible until the fetch settled, which read as "nothing happened."
- **Decouple persistence from the network.** Writing the link synchronously and enriching later
  makes the add feel instant and robust to any network outcome. `updateLinkTitle` is a proper
  command (not a UI-only patch) so agents can enrich titles too and the write flows through the
  same command → sync path.
- **No-op-on-missing.** A late title can't resurrect a link the user removed while the fetch was
  in flight.

## How it works

`add` computes the provider, calls `execute(addLink)` (returns the new `linkId`), then — only for
generic / bare-GitHub-repo URLs — awaits the fetch and calls `execute(updateLinkTitle)` when a
non-empty title comes back. Because the async function body runs synchronously up to the first
`await`, the `addLink` write has already committed by the time control yields. The card face reads
the host label from `shortLabelFor` until the title arrives, then re-renders via the existing
`useY` subscription.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/commands exec vitest run commands/link.test.ts` → 2 passed;
  `pnpm --filter @boardly/web exec vitest run lib/use-board-links.test.tsx` → 3 passed.
- **Gates:** `@boardly/sync` / `@boardly/commands` / `@boardly/web` `typecheck` + `lint` green.
- **Manual:** paste `https://zeitlabs.zohorecruit.com/jobs/Careers/856989000000569136/Senior-Frontend-Engineer`
  onto a card — the chip appears immediately (hostname label); if the page is reachable the title
  fills in shortly after; if the unfurl fails/times out the link stays with the host label.

## Follow-ups / known gaps

- Favicon capture for generic links is still out of scope (unfurl returns an `iconUrl`, but
  rendering a remote favicon — CSP/privacy/layout — is deferred). Generic links keep the provider
  icon; only the title enriches.
