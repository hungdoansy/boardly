import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../app";
import { generateTokenKeys, signAccessToken, type TokenKeys } from "../auth/tokens";
import { loadConfig } from "../config";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { users } from "../db/schema";
import { authenticateConnection } from "../sync/authz";
import { createTicketStore, type TicketStore } from "../sync/ticket-store";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("board ownership registry (integration, real db)", () => {
  let app: FastifyInstance;
  let handle: DbHandle;
  let keys: TokenKeys;
  let ticketStore: TicketStore;

  const bearer = async (userId: string): Promise<string> =>
    `Bearer ${await signAccessToken(keys, { sub: userId }, 900)}`;

  async function newUser(): Promise<string> {
    const [u] = await handle.db
      .insert(users)
      .values({ email: `t-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    return u!.id;
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

  it("registers ownership so the owner can then open the board's sync room", async () => {
    const userId = await newUser();
    const boardId = randomUUID();

    const res = await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: await bearer(userId) },
      payload: { id: boardId, title: "Roadmap" },
    });
    expect(res.statusCode).toBe(201);

    // Ties to Unit 3.5: authz now accepts the owner's ticket for this board.
    const ticket = ticketStore.issue(userId, `board:${boardId}`);
    const ctx = await authenticateConnection(
      { db: handle.db, ticketStore, allowedOrigins: new Set() },
      { token: ticket, documentName: `board:${boardId}`, origin: undefined },
    );
    expect(ctx.userId).toBe(userId);
  });

  it("is idempotent for the owner and lists the user's boards", async () => {
    const userId = await newUser();
    const boardId = randomUUID();
    const auth = await bearer(userId);

    await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: auth },
      payload: { id: boardId, title: "A" },
    });
    const again = await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: auth },
      payload: { id: boardId, title: "A renamed" },
    });
    expect(again.statusCode).toBe(200); // idempotent update, not 201

    const list = await app.inject({
      method: "GET",
      url: "/boards",
      headers: { authorization: auth },
    });
    const { boards } = list.json() as { boards: Array<{ id: string; title: string }> };
    expect(boards.find((b) => b.id === boardId)?.title).toBe("A renamed");
  });

  it("handles concurrent duplicate registration of a new board id without a 500", async () => {
    const userId = await newUser();
    const boardId = randomUUID();
    const auth = await bearer(userId);
    const register = () =>
      app.inject({
        method: "POST",
        url: "/boards",
        headers: { authorization: auth },
        payload: { id: boardId, title: "Race" },
      });

    // Fire several registrations for the same new id at once (the client can
    // double-fire). Exactly one inserts (201); the rest resolve idempotently
    // (200) — none 500 on the unique violation.
    const results = await Promise.all([register(), register(), register(), register()]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.every((c) => c === 200 || c === 201)).toBe(true);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
  });

  it("cannot register a board id already owned by another user", async () => {
    const owner = await newUser();
    const attacker = await newUser();
    const boardId = randomUUID();

    await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: await bearer(owner) },
      payload: { id: boardId, title: "Owned" },
    });
    const stolen = await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: await bearer(attacker) },
      payload: { id: boardId, title: "Mine now" },
    });
    expect(stolen.statusCode).toBe(409);

    // And the attacker cannot open the sync room for it (ties to U3.5 authz).
    const ticket = ticketStore.issue(attacker, `board:${boardId}`);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins: new Set() },
        { token: ticket, documentName: `board:${boardId}`, origin: undefined },
      ),
    ).rejects.toThrow();
  });

  it("archives an owned board and 404s for a non-owner", async () => {
    const owner = await newUser();
    const other = await newUser();
    const boardId = randomUUID();
    await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: await bearer(owner) },
      payload: { id: boardId, title: "T" },
    });

    const nonOwner = await app.inject({
      method: "POST",
      url: `/boards/${boardId}/archive`,
      headers: { authorization: await bearer(other) },
    });
    expect(nonOwner.statusCode).toBe(404);

    const archived = await app.inject({
      method: "POST",
      url: `/boards/${boardId}/archive`,
      headers: { authorization: await bearer(owner) },
    });
    expect(archived.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/boards",
      headers: { authorization: await bearer(owner) },
    });
    const { boards } = list.json() as { boards: Array<{ id: string }> };
    expect(boards.find((b) => b.id === boardId)).toBeUndefined(); // excluded once archived
  });

  it("rejects unauthenticated requests and malformed input", async () => {
    const noAuth = await app.inject({ method: "GET", url: "/boards" });
    expect(noAuth.statusCode).toBe(401);

    const bad = await app.inject({
      method: "POST",
      url: "/boards",
      headers: { authorization: await bearer(await newUser()) },
      payload: { id: "not-a-uuid", title: "" },
    });
    expect(bad.statusCode).toBe(400);
  });
});
