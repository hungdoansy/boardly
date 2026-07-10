// @boardly/mcp — an MCP server exposing every Boardly command as a tool, so an
// AI agent can drive Boardly. Tools are generated from the live REST catalog
// (Unit 3.9), so they never drift from the command layer. stdio transport.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { buildTools, callCommand, fetchCatalog, McpToolError } from "./tools.js";

async function main(): Promise<void> {
  const baseUrl = process.env.BOARDLY_API_URL ?? "http://localhost:8787";
  const token = process.env.BOARDLY_TOKEN;
  if (!token) {
    console.error("[boardly-mcp] BOARDLY_TOKEN is required (a Boardly access token).");
    process.exit(1);
  }

  let tools;
  try {
    tools = buildTools(await fetchCatalog(baseUrl));
  } catch (error) {
    console.error(
      `[boardly-mcp] could not load catalog from ${baseUrl}:`,
      (error as Error).message,
    );
    process.exit(1);
  }

  const server = new Server({ name: "boardly", version: "0.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await callCommand(baseUrl, token, name, args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result ?? null) }] };
    } catch (error) {
      // Surface as a tool error (not a crash): validation/auth/ownership, etc.
      const message = error instanceof McpToolError ? error.message : (error as Error).message;
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
  console.error(`[boardly-mcp] ready — ${tools.length} tools from ${baseUrl}`);
}

void main();
