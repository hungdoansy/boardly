# UNIT 10.4: Claude Code session links (`claude --resume <id>`)

- **Plan unit:** Unit 4 (`docs/plans/2026-07-14-001-feat-project-link-ux-batch-plan.md`)
- **Status:** done
- **Requirements:** R5 (paste a resume command → a recognized chip whose click copies the command)
- **Dependencies:** UNIT-10.2 (toast + clipboard), UNIT-10.3 (link add pipeline)

## What changed

- **`packages/domain/src/links/providers/claude-code.ts`** (new) — the parser/format helpers and
  the provider def:
  - `parseClaudeResume(text)` — session id from `claude --resume <id>`, `claude -r <id>`, or
    `claude --resume=<id>` (whitespace-tolerant, UUID-shaped, lowercased); else `null`.
  - `formatClaudeResumeUrl(id)` → `claude-code://resume/<id>`; `claudeResumeCommand(id)` →
    `claude --resume <id>`; `parseClaudeResumeUrl(url)` → id or `null`; `isClaudeCodeUrl(url)`.
  - `claudeCode` provider: matches protocol `claude-code:`; `shortLabel` → `Claude session <8>`.
- **`packages/domain/src/enums.ts`** — `LinkProvider.ClaudeCode = "claude-code"`.
- **`packages/domain/src/links/registry.ts`** — register `claudeCode` (before `generic`) + new
  `isStorableLinkUrl(url)` = safe http(s) **or** a claude-code session URL (still blocks
  `javascript:`/`data:`). `isSafeHttpUrl` is unchanged (still the `<a href>` gate).
- **`packages/domain/src/links/index.ts`** — export the new helpers.
- **`packages/commands/src/commands/link.ts`** — `addLink` now validates with `isStorableLinkUrl`.
- **`apps/web/lib/use-board.ts`** — `useLinkActions.add` guard uses `isStorableLinkUrl`; a
  claude-code URL is `ClaudeCode` (not Generic), so it skips the unfurl round-trip.
- **`apps/web/components/card/links.tsx`** — the add input canonicalizes a pasted resume command
  to a `claude-code://` URL; a claude-code link renders as a **copy button** (not an `<a>`) that
  copies `claude --resume <id>` via `copyText` and fires a `toast`.
- **`apps/web/components/card/provider-icon.tsx`** — `claude-code` reuses the Claude brand icon.
- **Tests:** `packages/domain/src/links/claude-code.test.ts` (parse variants; URL round-trip;
  provider detect/label; `isStorableLinkUrl`), `packages/commands/src/commands/link.test.ts`
  (accepts claude-code, rejects `javascript:`/`data:`), `apps/web/components/card/links.test.tsx`
  (paste → session chip; click → copy + toast).

## Why

- **Keep it in the links section.** The user pastes the command where links go. A raw command
  isn't a URL, so canonicalize it to a custom-scheme URL that flows through the normal
  detect/store/label pipeline; only the render diverges (copy, not navigate).
- **Copy, not open.** A local CLI session has no web page — the chosen behavior (see plan) is to
  copy the command to the clipboard for pasting into a terminal; no shell-exec, on web or desktop.
- **Narrow scheme relaxation.** Only `claude-code://resume/<uuid>` is allowed past the http gate;
  `isSafeHttpUrl` still governs the `href`, so `javascript:`/`data:` stay blocked everywhere.

## How it works

Paste → `parseClaudeResume` → `formatClaudeResumeUrl` → `actions.add` (which now accepts the
scheme) → `addLink` stores it, `detectProvider` tags it `ClaudeCode`. The chip label comes from
`shortLabelFor` (`Claude session <first-8>`); the card renders a `<button>` whose click resolves
the id from the stored URL (`parseClaudeResumeUrl`), copies `claudeResumeCommand(id)`, and toasts.

## How to test / verify

- **Unit:** `pnpm --filter @boardly/domain exec vitest run links/claude-code.test.ts` → 9 passed;
  `pnpm --filter @boardly/commands test` → 35 passed;
  `pnpm --filter @boardly/web exec vitest run components/card/links.test.tsx` → 9 passed.
- **Gates:** `@boardly/domain` / `@boardly/commands` / `@boardly/web` `typecheck` + `lint` green.
- **Manual:** paste `claude --resume 3d90b1bc-ada0-44c3-9ced-1be176c97044` onto a card → a
  "Claude session 3d90b1bc" chip with the Claude icon; click → the command lands on the clipboard
  and a "Resume command copied" toast appears; a normal URL still opens as before.

## Follow-ups / known gaps

- Desktop "run in a terminal" for the session is intentionally out of scope (copy only).
- Only the `resume` command shape is recognized; other `claude` subcommands are treated as plain
  text (fall through to normal link handling, which will reject non-URLs).
