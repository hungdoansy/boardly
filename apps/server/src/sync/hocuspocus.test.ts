import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { boards, users } from "../db/schema";
import { authenticateConnection, parseDocumentName, SyncUnauthorizedError } from "./authz";
import { loadDocState, storeDocState } from "./persistence";
import { createTicketStore } from "./ticket-store";

const DATABASE_URL = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Ticket store + document parsing (no db)
// ---------------------------------------------------------------------------

describe("ticket store", () => {
  it("issues a ticket that consumes exactly once", () => {
    const store = createTicketStore();
    const token = store.issue("user-1");
    expect(store.consume(token)).toEqual({ userId: "user-1" });
    expect(store.consume(token)).toBeNull(); // single-use
  });

  it("rejects an expired ticket and unknown tokens", () => {
    const store = createTicketStore();
    const token = store.issue("user-1", -1); // already expired
    expect(store.consume(token)).toBeNull();
    expect(store.consume("nope")).toBeNull();
  });
});

describe("parseDocumentName", () => {
  it("parses board and workspace docs", () => {
    expect(parseDocumentName("board:abc")).toEqual({ type: "board", boardId: "abc" });
    expect(parseDocumentName("workspace:u1")).toEqual({ type: "workspace", userId: "u1" });
  });
  it("returns null for malformed names", () => {
    expect(parseDocumentName("bogus")).toBeNull();
    expect(parseDocumentName("board:")).toBeNull();
    expect(parseDocumentName("other:x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Authorization + persistence (real db)
// ---------------------------------------------------------------------------

describe.skipIf(!DATABASE_URL)("sync authz + persistence (integration, real db)", () => {
  let handle: DbHandle;
  const allowedOrigins = new Set(["http://localhost:3000"]);

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
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  it("accepts the owner's ticket for their board", async () => {
    const { userId, boardId } = await seedUserWithBoard();
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(userId);
    const ctx = await authenticateConnection(
      { db: handle.db, ticketStore, allowedOrigins },
      { token, documentName: `board:${boardId}`, origin: "http://localhost:3000" },
    );
    expect(ctx.userId).toBe(userId);
  });

  it("rejects a non-owner", async () => {
    const { boardId } = await seedUserWithBoard();
    const [other] = await handle.db
      .insert(users)
      .values({ email: `t-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(other!.id);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token, documentName: `board:${boardId}`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("rejects an expired/invalid ticket before touching the board", async () => {
    const { boardId } = await seedUserWithBoard();
    const ticketStore = createTicketStore();
    const expired = ticketStore.issue("someone", -1);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token: expired, documentName: `board:${boardId}`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("rejects a disallowed origin without consuming the ticket", async () => {
    const { userId, boardId } = await seedUserWithBoard();
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(userId);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token, documentName: `board:${boardId}`, origin: "https://evil.example" },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
    // Ticket survived (origin was checked first), so the owner can still connect.
    expect(ticketStore.consume(token)).toEqual({ userId });
  });

  it("authorizes a user's own workspace room but not another's", async () => {
    const { userId } = await seedUserWithBoard();
    const ticketStore = createTicketStore();
    const ownToken = ticketStore.issue(userId);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token: ownToken, documentName: `workspace:${userId}`, origin: undefined },
      ),
    ).resolves.toEqual({ userId });

    const otherToken = ticketStore.issue(userId);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token: otherToken, documentName: `workspace:someone-else`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("persists and reloads Yjs state, converging two clients' edits", async () => {
    const docName = `board:${randomUUID()}`;

    // Two clients edit independently, then their updates merge.
    const a = new Y.Doc();
    a.getMap("m").set("fromA", 1);
    const b = new Y.Doc();
    b.getMap("m").set("fromB", 2);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    // Server stores the merged snapshot.
    await storeDocState(handle.db, docName, Y.encodeStateAsUpdate(a));

    // A fresh client loads the persisted state and sees both edits.
    const loaded = await loadDocState(handle.db, docName);
    expect(loaded).toBeInstanceOf(Uint8Array);
    const c = new Y.Doc();
    Y.applyUpdate(c, loaded!);
    expect(c.getMap("m").get("fromA")).toBe(1);
    expect(c.getMap("m").get("fromB")).toBe(2);

    // Upsert path: a later store overwrites the snapshot.
    a.getMap("m").set("fromA", 99);
    await storeDocState(handle.db, docName, Y.encodeStateAsUpdate(a));
    const reloaded = new Y.Doc();
    Y.applyUpdate(reloaded, (await loadDocState(handle.db, docName))!);
    expect(reloaded.getMap("m").get("fromA")).toBe(99);
  });
});
