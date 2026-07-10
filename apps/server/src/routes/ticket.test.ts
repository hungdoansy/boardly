import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateTokenKeys, signAccessToken, type TokenKeys } from "../auth/tokens";
import { buildServer } from "../app";
import { loadConfig } from "../config";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { boards, users } from "../db/schema";
import { authenticateConnection } from "../sync/authz";
import { createTicketStore, type TicketStore } from "../sync/ticket-store";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("POST /sync/ticket (integration, real db)", () => {
  let app: FastifyInstance;
  let handle: DbHandle;
  let keys: TokenKeys;
  let ticketStore: TicketStore;

  const bearer = async (userId: string): Promise<string> =>
    `Bearer ${await signAccessToken(keys, { sub: userId }, 900)}`;

  async function seedUserWithBoard(): Promise<{ userId: string; boardId: string }> {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `t-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    const [board] = await handle.db
      .insert(boards)
      .values({ ownerId: user!.id, title: "Board" })
      .returning({ id: boards.id });
    return { userId: user!.id, boardId: board!.id };
  }

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
    keys = await generateTokenKeys();
    ticketStore = createTicketStore();
    const config = loadConfig({ DATABASE_URL, NODE_ENV: "test" });
    app = buildServer({ config, pool: handle.pool, database: handle.db, ticketStore, keys });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
  });

  it("issues a ticket for an owned board that then authenticates a sync connection", async () => {
    const { userId, boardId } = await seedUserWithBoard();
    const res = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: await bearer(userId) },
      payload: { documentName: `board:${boardId}` },
    });
    expect(res.statusCode).toBe(200);
    const { ticket } = res.json() as { ticket: string };
    expect(ticket).toBeTruthy();

    // The ticket authenticates the matching sync connection (end-to-end).
    const ctx = await authenticateConnection(
      { db: handle.db, ticketStore, allowedOrigins: new Set() },
      { token: ticket, documentName: `board:${boardId}`, origin: undefined },
    );
    expect(ctx.userId).toBe(userId);
  });

  it("issues a ticket for the user's own workspace", async () => {
    const { userId } = await seedUserWithBoard();
    const res = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: await bearer(userId) },
      payload: { documentName: `workspace:${userId}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("forbids a ticket for a board the user does not own", async () => {
    const { boardId } = await seedUserWithBoard();
    const res = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: await bearer(randomUUID()) },
      payload: { documentName: `board:${boardId}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("forbids a ticket for another user's workspace", async () => {
    const { userId } = await seedUserWithBoard();
    const res = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: await bearer(userId) },
      payload: { documentName: `workspace:someone-else` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a missing or invalid Bearer token with 401", async () => {
    const noAuth = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      payload: { documentName: "workspace:x" },
    });
    expect(noAuth.statusCode).toBe(401);

    const badAuth = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: "Bearer not-a-jwt" },
      payload: { documentName: "workspace:x" },
    });
    expect(badAuth.statusCode).toBe(401);
  });

  it("rejects a malformed document name with 400", async () => {
    const { userId } = await seedUserWithBoard();
    const res = await app.inject({
      method: "POST",
      url: "/sync/ticket",
      headers: { authorization: await bearer(userId) },
      payload: { documentName: "bogus" },
    });
    expect(res.statusCode).toBe(400);
  });
});
