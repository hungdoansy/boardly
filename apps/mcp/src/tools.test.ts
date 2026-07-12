import { describe, expect, it, vi } from "vitest";

import { buildTools, callCommand, fetchCatalog, McpToolError, type CatalogCommand } from "./tools";

// A boardId-less catalog: every command runs against the caller's single doc,
// so no tool carries a `boardId`, and there is no board-registration/list tool.
const catalog: CatalogCommand[] = [
  {
    name: "createCard",
    description: "Create a card in a column.",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { columnId: { type: "string" }, title: { type: "string" } },
      required: ["columnId", "title"],
    },
  },
  {
    name: "setTicketPrefix",
    description: "Set the board's display-only ticket prefix.",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { prefix: { type: "string" } },
      required: ["prefix"],
    },
  },
];

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("buildTools", () => {
  it("maps every catalog command to a tool, 1:1, preserving name/description/schema", () => {
    const tools = buildTools(catalog);
    expect(tools.map((t) => t.name)).toEqual(["createCard", "setTicketPrefix"]);
    const createCard = tools[0]!;
    expect(createCard.description).toBe("Create a card in a column.");
    expect(createCard.inputSchema.type).toBe("object");
    // `$schema` is stripped (MCP wants a bare object schema); properties kept.
    expect(createCard.inputSchema.$schema).toBeUndefined();
    expect((createCard.inputSchema.properties as Record<string, unknown>).title).toEqual({
      type: "string",
    });
  });

  it("carries no boardId and no board-registration/list tool (boardId-less surface)", () => {
    const tools = buildTools(catalog);
    // No tool addresses a board by id — commands run against the caller's doc.
    for (const tool of tools) {
      const props = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(props)).not.toContain("boardId");
    }
    // Board-entity tooling is gone from the catalog the tools derive from.
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("createBoard");
    expect(names).not.toContain("listBoards");
    expect(names).not.toContain("archiveBoard");
    expect(names).not.toContain("registerBoard");
  });

  it("guarantees type:object even if the catalog omitted it", () => {
    const tools = buildTools([{ name: "x", description: "d", inputSchema: {} }]);
    expect(tools[0]!.inputSchema.type).toBe("object");
  });
});

describe("fetchCatalog", () => {
  it("returns the catalog commands", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { commands: catalog }));
    const result = await fetchCatalog("http://api.test/", fetchMock as unknown as typeof fetch);
    expect(result).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/commands");
  });

  it("throws when the catalog request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(
      fetchCatalog("http://api.test", fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/catalog/);
  });
});

describe("callCommand", () => {
  it("forwards the call with a Bearer token and returns the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { result: { id: "c1" } }));
    const result = await callCommand(
      "http://api.test",
      "tok",
      "createCard",
      { columnId: "col1", title: "T" },
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ id: "c1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/commands/createCard");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ columnId: "col1", title: "T" });
  });

  it("raises McpToolError carrying the status + server message on failure", async () => {
    for (const [status, msg] of [
      [400, "invalid input"],
      [401, "unauthorized"],
      [403, "forbidden"],
    ] as const) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, { error: msg }));
      const err = await callCommand(
        "http://api.test",
        "tok",
        "createCard",
        {},
        fetchMock as unknown as typeof fetch,
      ).catch((e) => e);
      expect(err).toBeInstanceOf(McpToolError);
      expect((err as McpToolError).status).toBe(status);
      expect((err as McpToolError).message).toBe(msg);
    }
  });
});
