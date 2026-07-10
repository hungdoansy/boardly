// Pure catalog → MCP-tool mapping + REST forwarding. Kept free of the MCP
// transport so it is unit-testable with a mocked fetch. The tool surface is
// GENERATED from the live `GET /api/commands` catalog, so it can never drift
// from the REST API / command layer.

export interface CatalogCommand {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

type FetchLike = typeof fetch;

const stripBaseUrl = (url: string): string => url.replace(/\/$/, "");

/** Fetch the command catalog from the Boardly server. */
export async function fetchCatalog(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<CatalogCommand[]> {
  const res = await fetchImpl(`${stripBaseUrl(baseUrl)}/api/commands`);
  if (!res.ok) throw new Error(`failed to fetch command catalog (${res.status})`);
  const data = (await res.json()) as { commands?: CatalogCommand[] };
  return data.commands ?? [];
}

/** One MCP tool per command. MCP requires an object `inputSchema`. */
export function buildTools(catalog: CatalogCommand[]): McpTool[] {
  return catalog.map((command) => ({
    name: command.name,
    description: command.description,
    inputSchema: toObjectSchema(command.inputSchema),
  }));
}

function toObjectSchema(schema: Record<string, unknown>): Record<string, unknown> {
  // z.toJSONSchema emits a `$schema` key; drop it (MCP wants a bare object
  // schema) and guarantee `type: "object"` which MCP's tool schema requires.
  const { $schema: _drop, ...rest } = schema as { $schema?: unknown } & Record<string, unknown>;
  return { type: "object", ...rest };
}

/** Raised when a forwarded command call fails; carries the HTTP status. */
export class McpToolError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

/**
 * Forward a tool call to `POST /api/commands/:name` with the Bearer token and
 * return the command's `result`. Throws {@link McpToolError} on any non-2xx
 * (validation `400`, auth `401`, ownership `403`, …) so the caller can surface
 * it as a tool error instead of crashing.
 */
export async function callCommand(
  baseUrl: string,
  token: string,
  name: string,
  args: unknown,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const res = await fetchImpl(`${stripBaseUrl(baseUrl)}/api/commands/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = (body as { error?: unknown }).error;
    throw new McpToolError(
      res.status,
      typeof err === "string" ? err : `request failed (${res.status})`,
    );
  }
  return (body as { result?: unknown }).result;
}
