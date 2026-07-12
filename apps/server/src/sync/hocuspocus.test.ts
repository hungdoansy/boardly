import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { users } from "../db/schema";
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
    const token = store.issue("user-1", "board:b1");
    expect(store.consume(token)).toEqual({ userId: "user-1", documentName: "board:b1" });
    expect(store.consume(token)).toBeNull(); // single-use
  });

  it("rejects an expired ticket and unknown tokens", () => {
    const store = createTicketStore();
    const token = store.issue("user-1", "board:b1", -1); // already expired
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

  // The content doc is `board:<userId>` and is authorized purely by identity —
  // there is no `boards` ownership table. A "user id" is any string; we mint a
  // real users row only where the FK / realism helps, but authz never reads it.
  async function seedUser(): Promise<string> {
    const [user] = await handle.db
      .insert(users)
      .values({ email: `t-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    return user!.id;
  }

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  it("accepts the user's ticket for their own board doc (no ownership table)", async () => {
    const userId = await seedUser();
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(userId, `board:${userId}`);
    const ctx = await authenticateConnection(
      { db: handle.db, ticketStore, allowedOrigins },
      { token, documentName: `board:${userId}`, origin: "http://localhost:3000" },
    );
    expect(ctx.userId).toBe(userId);
  });

  it("rejects a ticket for another user's board doc", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const ticketStore = createTicketStore();
    // A valid, matching ticket — but the room id (owner) is not the caller (other).
    const token = ticketStore.issue(other, `board:${owner}`);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token, documentName: `board:${owner}`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("rejects an expired/invalid ticket before checking the document", async () => {
    const userId = await seedUser();
    const ticketStore = createTicketStore();
    const expired = ticketStore.issue(userId, `board:${userId}`, -1);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token: expired, documentName: `board:${userId}`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("rejects a ticket minted for a different document", async () => {
    const userId = await seedUser();
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(userId, `board:${userId}`);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token, documentName: `board:${userId}-other`, origin: undefined },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
  });

  it("rejects a disallowed origin without consuming the ticket", async () => {
    const userId = await seedUser();
    const ticketStore = createTicketStore();
    const token = ticketStore.issue(userId, `board:${userId}`);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token, documentName: `board:${userId}`, origin: "https://evil.example" },
      ),
    ).rejects.toBeInstanceOf(SyncUnauthorizedError);
    // Ticket survived (origin was checked first), so the user can still connect.
    expect(ticketStore.consume(token)).toEqual({ userId, documentName: `board:${userId}` });
  });

  it("authorizes a user's own workspace room but not another's", async () => {
    const userId = await seedUser();
    const ticketStore = createTicketStore();
    const ownToken = ticketStore.issue(userId, `workspace:${userId}`);
    await expect(
      authenticateConnection(
        { db: handle.db, ticketStore, allowedOrigins },
        { token: ownToken, documentName: `workspace:${userId}`, origin: undefined },
      ),
    ).resolves.toEqual({ userId });

    const otherToken = ticketStore.issue(userId, `workspace:someone-else`);
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
