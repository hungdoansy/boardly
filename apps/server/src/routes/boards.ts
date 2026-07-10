import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { boards } from "../db/schema";

export interface BoardRoutesOptions {
  db: Database;
  keys: TokenKeys;
}

const registerSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

/** Postgres unique_violation (SQLSTATE 23505). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

/**
 * Board ownership registry. A board's id is chosen client-side (it is the Yjs
 * sync room); registering here inserts the `boards` row that Hocuspocus authz
 * (Unit 3.5) reads to authorize the sync connection. All routes require a
 * Bearer access token and enforce ownership.
 */
export async function boardRoutes(app: FastifyInstance, opts: BoardRoutesOptions): Promise<void> {
  const { db, keys } = opts;

  // Register (or re-affirm) ownership of a board. Idempotent for the owner;
  // rejects an id already owned by someone else.
  app.post("/boards", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request" });
    const { id, title } = parsed.data;

    // Idempotent for the owner; 409 for a foreign id. The insert is wrapped so a
    // concurrent duplicate insert (two registrations of the same new board id
    // race — the client can fire twice) resolves as an idempotent update rather
    // than surfacing a 500 unique-violation.
    const affirmOwnership = async (): Promise<"ok" | "conflict"> => {
      const [row] = await db
        .select({ ownerId: boards.ownerId })
        .from(boards)
        .where(eq(boards.id, id))
        .limit(1);
      if (!row || row.ownerId !== userId) return "conflict";
      await db.update(boards).set({ title, updatedAt: new Date() }).where(eq(boards.id, id));
      return "ok";
    };

    const [existing] = await db
      .select({ ownerId: boards.ownerId })
      .from(boards)
      .where(eq(boards.id, id))
      .limit(1);

    if (existing) {
      const result = await affirmOwnership();
      if (result === "conflict") return reply.status(409).send({ error: "board id taken" });
      return reply.send({ id, ok: true });
    }

    try {
      await db.insert(boards).values({ id, ownerId: userId, title });
      return reply.status(201).send({ id, ok: true });
    } catch (err) {
      // 23505 = unique_violation: another request inserted this id first.
      if (isUniqueViolation(err)) {
        const result = await affirmOwnership();
        if (result === "conflict") return reply.status(409).send({ error: "board id taken" });
        return reply.send({ id, ok: true });
      }
      throw err;
    }
  });

  // List the user's non-archived boards (for login reconciliation).
  app.get("/boards", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const rows = await db
      .select({ id: boards.id, title: boards.title, archived: boards.archived })
      .from(boards)
      .where(and(eq(boards.ownerId, userId), eq(boards.archived, false)));
    return reply.send({ boards: rows });
  });

  // Archive a board the user owns (soft; ownership enforced).
  app.post("/boards/:id/archive", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const id = (request.params as { id: string }).id;
    const updated = await db
      .update(boards)
      .set({ archived: true, updatedAt: new Date() })
      .where(and(eq(boards.id, id), eq(boards.ownerId, userId)))
      .returning({ id: boards.id });
    if (updated.length === 0) return reply.status(404).send({ error: "not found" });
    return reply.send({ id, ok: true });
  });
}
