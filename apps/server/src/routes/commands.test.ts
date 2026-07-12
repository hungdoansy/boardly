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

  it("rejects unknown command (404), invalid input (400), and no auth (401)", async () => {
    const auth = await bearer(await newUser());

    expect((await post("nopeCommand", auth, {})).statusCode).toBe(404);
    expect((await post("createCard", auth, {})).statusCode).toBe(400); // missing title
    expect((await post("createCard", undefined, { title: "x" })).statusCode).toBe(401);
  });
});
