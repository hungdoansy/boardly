# @boardly/mcp

An [MCP](https://modelcontextprotocol.io) server that exposes **every Boardly command** as a tool, so
an AI agent (Claude, etc.) can drive Boardly directly — create/move cards, set status, add links,
list/search boards, and more.

The tool surface is **generated at startup** from the Boardly server's live command catalog
(`GET /api/commands`, Unit 3.9), so it can never drift from the REST API or the app's command layer.
Each tool call forwards to `POST /api/commands/:name` with your access token; the mutation persists to
Postgres and broadcasts to any connected web/desktop clients (agent-native parity, R13).

## Configuration

Two environment variables:

| Var               | Default                 | Meaning                                           |
| ----------------- | ----------------------- | ------------------------------------------------- |
| `BOARDLY_API_URL` | `http://localhost:8787` | Base URL of the Boardly server.                   |
| `BOARDLY_TOKEN`   | _(required)_            | A Boardly access token (Bearer) to act as a user. |

Get a token by logging in (`POST /auth/login` returns `accessToken`).

## Use in an MCP client

Add to your MCP client config (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "boardly": {
      "command": "pnpm",
      "args": ["--filter", "@boardly/mcp", "start"],
      "env": {
        "BOARDLY_API_URL": "http://localhost:8787",
        "BOARDLY_TOKEN": "<your access token>"
      }
    }
  }
}
```

The server speaks MCP over **stdio**. On startup it logs (to stderr) how many tools it loaded.

## Notes / limitations

- Access tokens are short-lived; a long-running agent session will need a fresh token. A dedicated
  service/refresh token is a follow-up.
- Multi-document read commands (e.g. `searchCards` spanning boards) aren't executable via the current
  single-doc REST path and will return a tool error.
