# UNIT 3.10: MCP server (`apps/mcp`)

- **Plan unit:** 3.10 (`docs/plans/2026-07-09-001-feat-boardly-full-build-plan.md` → Phase 3)
- **Status:** done
- **Requirements:** R13
- **Dependencies:** 3.9 (REST command API) — satisfied
- **Commit(s):** _this unit's commit_

## What changed

A new `apps/mcp` — an MCP (Model Context Protocol) server that exposes **every Boardly command as a
tool**, generated at startup from the live REST catalog, so an AI agent can drive Boardly.

- `apps/mcp/src/tools.ts` — pure, testable core (no MCP transport):
  - `fetchCatalog(baseUrl)` — `GET /api/commands`.
  - `buildTools(catalog)` — one MCP tool per command (name + description + object `inputSchema`,
    `$schema` stripped). **Generated from the catalog**, never hand-maintained.
  - `callCommand(baseUrl, token, name, args)` — forwards to `POST /api/commands/:name` with the
    Bearer token; returns the command's `result` or throws `McpToolError(status, message)`.
- `apps/mcp/src/index.ts` — the MCP server (stdio): reads `BOARDLY_API_URL` + `BOARDLY_TOKEN`, loads
  the catalog, serves `ListTools` (the generated tools) and `CallTool` (forwards via `callCommand`;
  failures returned as `{ isError: true }` tool errors, not crashes).
- `apps/mcp/{package.json,tsconfig.json,vitest.config.ts,README.md}`; `@modelcontextprotocol/sdk
1.29.0` pinned; added to the root vitest projects. Tests: `apps/mcp/src/tools.test.ts`.
- `pnpm-workspace.yaml` — set `verifyDepsBeforeRun: false` (the pre-run deps check re-ran `pnpm
install`, which exits non-zero on the allow-listed esbuild build-script notice and was failing every
  `pnpm --filter <pkg> <script>`); removed the junk `allowBuilds` placeholder pnpm kept re-adding.

## Why (decisions)

- **Generate the tool surface from the live catalog.** `GET /api/commands` already emits JSON Schema
  per command (3.9), so the MCP tools are a 1:1 projection — the agent surface can never drift from
  REST or the command layer, and new commands appear automatically. (Verified: 33 tools == 33 catalog
  commands.)
- **Thin forwarder, not a second implementation.** Each tool call is just `POST /api/commands/:name`;
  all validation, authorization (board ownership), persistence, and broadcast happen in the server
  (3.9). The MCP layer adds no business logic — only transport + error shaping.
- **Low-level MCP `Server` with JSON-Schema tools.** The catalog gives JSON Schema; the MCP protocol's
  `tool.inputSchema` _is_ JSON Schema, so the low-level `ListTools`/`CallTool` handlers pass it through
  directly (no JSON-Schema→zod round-trip).
- **Errors as tool errors, not crashes.** `callCommand` raises `McpToolError` on any non-2xx; the
  `CallTool` handler returns `{ content, isError: true }` so invalid args (`400`), auth (`401`), and
  ownership (`403`) surface to the agent instead of killing the server.
- **User Bearer token for now.** The MCP acts as a user via `BOARDLY_TOKEN`. A dedicated
  service/refresh token (for long-lived sessions) is a documented follow-up.

## How to test / verify

`export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.

- **Unit (always):** `pnpm --filter @boardly/mcp test` — `buildTools` maps the catalog 1:1 (strips
  `$schema`, guarantees `type:object`); `fetchCatalog` returns commands / throws on failure;
  `callCommand` forwards with the Bearer token + JSON body and raises `McpToolError` carrying the
  status + server message on `400`/`401`/`403`.
- **Live end-to-end (server running):** against the live server, `fetchCatalog`+`buildTools` produced
  **33 tools == 33 catalog commands**; `callCommand("createCard", …)` created a card
  (`{title:"Made by an agent", status:"todo"}`); invalid args → `McpToolError 400`; a bad token →
  `McpToolError 401`. (3.9 already showed a REST-created card broadcasting to a connected client, so
  the full agent→MCP→REST→command→sync chain is covered.)
- **Gates:** `pnpm -r typecheck` (8/8), `pnpm -r lint` (8/8), `pnpm -r test` (mcp 6 / server 70 /
  web 92 / …), `pnpm --filter @boardly/mcp build`, `pnpm format:check` — all green. CLI/stdio server
  (no UI) → no Playwright screenshot applies.

## Follow-ups / known gaps

- **Service/refresh token**: access tokens are short-lived; a long-running agent session needs a
  refresh or a scoped service token (ties to the 3.9 follow-up).
- **Multi-doc read commands** (`searchCards`) aren't executable via the single-doc REST path yet, so
  that tool returns an error; a read path can be added if agents need cross-board search.
- **Protocol-level integration test** (spawning the stdio server via an MCP client) is covered by the
  live check + the unit tests of the forwarder; a spawned-client test could be added with the 5.4
  e2e suite.
