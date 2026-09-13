import { randomUUID } from "node:crypto";

import { commands as catalog } from "@boardly/commands";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { buildServer } from "../app";
import { COMMAND_BODY_LIMIT_BYTES } from "./commands";
import { generateTokenKeys, signAccessToken, type TokenKeys } from "../auth/tokens";
import { loadConfig } from "../config";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { users } from "../db/schema";
import { createSyncServer } from "../sync/hocuspocus";
import { createTicketStore } from "../sync/ticket-store";
import { loadDocState } from "../sync/persistence";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("REST command API (integration, real db + sync)", () => {
  let app: FastifyInstance;
  let handle: DbHandle;
  let keys: TokenKeys;
  let syncServer: ReturnType<typeof createSyncServer>;

  const bearer = async (userId: string): Promise<string> =>
    `Bearer ${await signAccessToken(keys, { sub: userId }, 900)}`;

  async function newUser(): Promise<string> {
    const [u] = await handle.db
      .insert(users)
      .values({ email: `t-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    return u!.id;
  }

  const post = (
    name: string,
    auth: string | undefined,
    body: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> =>
    app.inject({
      method: "POST",
      url: `/api/commands/${name}`,
      headers: auth ? { authorization: auth } : {},
      payload: body,
    });

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
    keys = await generateTokenKeys();
    const ticketStore = createTicketStore();
    const config = loadConfig({ DATABASE_URL, NODE_ENV: "test" });
    syncServer = createSyncServer({ db: handle.db, ticketStore, config });
    app = buildServer({
      config,
      pool: handle.pool,
      database: handle.db,
      keys,
      hocuspocus: syncServer.hocuspocus,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
  });

  it("GET /api/commands lists every command with a JSON input schema", async () => {
    const res = await app.inject({ method: "GET", url: "/api/commands" });
    expect(res.statusCode).toBe(200);
    const { commands } = res.json() as {
      commands: Array<{ name: string; description: string; inputSchema: { type?: string } }>;
    };
    expect(commands).toHaveLength(catalog.length);
    const createCard = commands.find((c) => c.name === "createCard");
    expect(createCard?.inputSchema.type).toBe("object");
    expect(createCard?.description.length).toBeGreaterThan(0);
  });

  it("executes createCard (no boardId) against the caller's doc and persists it to Postgres", async () => {
    const userId = await newUser();
    const auth = await bearer(userId);

    const card = await post("createCard", auth, { title: "From REST" });
    expect(card.statusCode).toBe(200);
    const created = (card.json() as { result: { id: string; title: string } }).result;
    expect(created.title).toBe("From REST");

    // A second request reads the same doc back (its content survives the first
    // request's flush + disconnect).
    const state = await loadDocState(handle.db, `board:${userId}`);
    expect(state).toBeInstanceOf(Uint8Array);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state!);
    const titles = [...doc.getMap("cards").values()].map((c) =>
      c instanceof Y.Map ? c.get("title") : undefined,
    );
    expect(titles).toContain("From REST");
  });

  it("resolves the doc from the authenticated user id — two users write distinct docs", async () => {
    const alice = await newUser();
    const bob = await newUser();

    await post("createCard", await bearer(alice), { title: "Alice card" });
    await post("createCard", await bearer(bob), { title: "Bob card" });

    const titlesOf = async (userId: string): Promise<Array<unknown>> => {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, (await loadDocState(handle.db, `board:${userId}`))!);
      return [...doc.getMap("cards").values()].map((c) =>
        c instanceof Y.Map ? c.get("title") : undefined,
      );
    };
    expect(await titlesOf(alice)).toEqual(["Alice card"]);
    expect(await titlesOf(bob)).toEqual(["Bob card"]);
  });

  it("REST execution yields the same result shape as an in-process execution (parity)", async () => {
    const userId = await newUser();
    const auth = await bearer(userId);
    const res = await post("createCard", auth, { title: "Parity" });
    const created = (res.json() as { result: { title: string; status: string } }).result;
    // Same shape a UI/in-memory execution yields (default status = Todo).
    expect(created.title).toBe("Parity");
    expect(created.status).toBe("todo");
  });

  // UNIT-21 U5: the agent path for import. These run against the real route,
  // which resolves the caller's *existing* board doc — the exact condition the
  // create-once guard turned into a silent no-op, and which an in-memory unit
  // test building into a fresh `new Y.Doc()` structurally cannot reach.
  it("importBoard's generated schema requires a mode with no default", async () => {
    const res = await app.inject({ method: "GET", url: "/api/commands" });
    const body = res.json() as {
      commands: Array<{ name: string; inputSchema: Record<string, unknown> }>;
    };
    const schema = body.commands.find((c) => c.name === "importBoard")!.inputSchema as {
      required?: string[];
      properties?: Record<string, Record<string, unknown>>;
    };
    expect(schema.required).toContain("mode");
    expect(schema.properties?.mode?.enum).toEqual(["replace", "merge", "copy"]);
    expect(schema.properties?.mode).not.toHaveProperty("default");
    expect(schema.properties?.acknowledgeReplace).toMatchObject({ const: true });
  });

  it("agent path: export → mutate → replace-import restores the board exactly", async () => {
    const userId = await newUser();
    const auth = await bearer(userId);

    await post("createProject", auth, { id: "p1", name: "Web", color: "#5e6ad2" });
    await post("createLabel", auth, { id: "l1", name: "bug", color: "#eb5757" });
    await post("createCard", auth, { id: "a1", title: "Alpha", projectId: "p1" });
    await post("createCard", auth, { id: "a2", title: "Beta" });

    const exported = (await post("exportBoard", auth, {})).json<{ result: unknown }>().result;
    expect((exported as { cards: unknown[] }).cards).toHaveLength(2);

    // Diverge from the file in three ways, then restore it.
    await post("renameCard", auth, { cardId: "a1", title: "Changed" });
    await post("archiveCard", auth, { cardId: "a2" });
    await post("createCard", auth, { id: "a3", title: "Added after the export" });

    const restore = await post("importBoard", auth, {
      snapshot: exported,
      mode: "replace",
      acknowledgeReplace: true,
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json<{ result: { cards: unknown } }>().result.cards).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
    });

    const after = (await post("exportBoard", auth, {})).json<{ result: unknown }>().result;
    expect(after).toEqual(exported);
  });

  it("merges over the live doc and reports what it did", async () => {
    const userId = await newUser();
    const auth = await bearer(userId);
    await post("createCard", auth, { id: "keep", title: "Board only" });

    const res = await post("importBoard", auth, {
      snapshot: {
        board: { title: "Incoming" },
        cards: [{ id: "fresh", title: "From the file", status: "todo" }],
      },
      mode: "merge",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ result: { mode: string; cards: unknown } }>().result).toMatchObject({
      mode: "merge",
      cards: { created: 1, updated: 0, skipped: 0 },
    });

    const titles = (await post("exportBoard", auth, {}))
      .json<{
        result: { cards: Array<{ title: string }> };
      }>()
      .result.cards.map((c) => c.title);
    expect(titles.sort()).toEqual(["Board only", "From the file"]);
  });

  it("rejects an omitted mode and an unacknowledged replace with 400 (R22, KTD9)", async () => {
    const auth = await bearer(await newUser());
    const snapshot = { board: { title: "x" }, cards: [] };

    expect((await post("importBoard", auth, { snapshot })).statusCode).toBe(400);
    expect((await post("importBoard", auth, { snapshot, mode: "replace" })).statusCode).toBe(400);
    expect(
      (await post("importBoard", auth, { snapshot, mode: "replace", acknowledgeReplace: true }))
        .statusCode,
    ).toBe(200);
  });

  it("carries an import's own reason into the 422, with the board unchanged (R21)", async () => {
    const userId = await newUser();
    const auth = await bearer(userId);
    await post("createCard", auth, { id: "keep", title: "Survives" });

    // A malformed fractional key: the apply throws mid-way through staging.
    const res = await post("importBoard", auth, {
      snapshot: {
        board: { title: "Never lands" },
        cards: [
          { id: "a", title: "A", status: "todo", ord: "!!!" },
          { id: "b", title: "B", status: "todo" },
        ],
      },
      mode: "replace",
      acknowledgeReplace: true,
    });

    expect(res.statusCode).toBe(422);
    const message = res.json<{ error: string }>().error;
    expect(message).not.toBe("command failed");
    expect(message).toContain("the board was not changed");

    const titles = (await post("exportBoard", auth, {}))
      .json<{
        result: { cards: Array<{ title: string }> };
      }>()
      .result.cards.map((c) => c.title);
    expect(titles).toEqual(["Survives"]);
  });

  it("returns 413 for a body over the command route's limit, not an opaque failure", async () => {
    const auth = await bearer(await newUser());
    const filler = "x".repeat(COMMAND_BODY_LIMIT_BYTES);
    const res = await app.inject({
      method: "POST",
      url: "/api/commands/importBoard",
      headers: { authorization: auth, "content-type": "application/json" },
      payload: `{"mode":"merge","snapshot":{"board":{"title":"${filler}"}}}`,
    });

    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: string }>().error).toContain("too large");
  });

  it("rejects unknown command (404), invalid input (400), and no auth (401)", async () => {
    const auth = await bearer(await newUser());

    expect((await post("nopeCommand", auth, {})).statusCode).toBe(404);
    expect((await post("createCard", auth, {})).statusCode).toBe(400); // missing title
    expect((await post("createCard", undefined, { title: "x" })).statusCode).toBe(401);
  });
});
