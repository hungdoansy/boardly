import { randomUUID } from "node:crypto";

import { commands as catalog } from "@boardly/commands";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { buildServer } from "../app";
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
  // The board doc is `board:<userId>` (one per user, authorized by identity), so
  // the board a user "owns" is simply the doc addressed by their own id.
  function ownedBoard(userId: string): string {
    return userId;
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

  it("executes createCard on an owned board and persists it to Postgres", async () => {
    const userId = await newUser();
    const boardId = ownedBoard(userId);
    const auth = await bearer(userId);

    const col = await post("addColumn", auth, { boardId, title: "To Do" });
    expect(col.statusCode).toBe(200);
    const columnId = (col.json() as { result: { id: string } }).result.id;

    const card = await post("createCard", auth, { boardId, columnId, title: "From REST" });
    expect(card.statusCode).toBe(200);
    const created = (card.json() as { result: { id: string; title: string } }).result;
    expect(created.title).toBe("From REST");

    // Persisted to Postgres (reload the raw doc state and find the card).
    const state = await loadDocState(handle.db, `board:${boardId}`);
    expect(state).toBeInstanceOf(Uint8Array);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state!);
    const titles = [...doc.getMap("cards").values()].map((c) =>
      c instanceof Y.Map ? c.get("title") : undefined,
    );
    expect(titles).toContain("From REST");
  });

  it("REST and in-process execution produce the same doc state (parity)", async () => {
    const userId = await newUser();
    const boardId = ownedBoard(userId);
    const auth = await bearer(userId);
    const col = await post("addColumn", auth, { boardId, title: "Col" });
    const columnId = (col.json() as { result: { id: string } }).result.id;
    const res = await post("createCard", auth, { boardId, columnId, title: "Parity" });
    const created = (res.json() as { result: { columnId: string; status: string } }).result;
    // Same shape a UI/in-memory execution yields (default status, linked column).
    expect(created.columnId).toBe(columnId);
    expect(created.status).toBe("todo");
  });

  it("forbids a command against a board the user does not own (403)", async () => {
    const owner = await newUser();
    const boardId = ownedBoard(owner);
    const attacker = await newUser();
    const res = await post("addColumn", await bearer(attacker), { boardId, title: "x" });
    expect(res.statusCode).toBe(403);
  });

  it("rejects unknown command (404), invalid input (400), and no auth (401)", async () => {
    const userId = await newUser();
    const boardId = ownedBoard(userId);
    const auth = await bearer(userId);

    expect((await post("nopeCommand", auth, {})).statusCode).toBe(404);
    expect((await post("addColumn", auth, { boardId })).statusCode).toBe(400); // missing title
    expect((await post("addColumn", undefined, { boardId, title: "x" })).statusCode).toBe(401);
  });
});
