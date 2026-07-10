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

    const [existing] = await db
      .select({ ownerId: boards.ownerId })
      .from(boards)
      .where(eq(boards.id, id))
      .limit(1);

    if (existing) {
      if (existing.ownerId !== userId) return reply.status(409).send({ error: "board id taken" });
      // Idempotent: refresh the title, keep ownership.
      await db.update(boards).set({ title, updatedAt: new Date() }).where(eq(boards.id, id));
      return reply.send({ id, ok: true });
    }

    await db.insert(boards).values({ id, ownerId: userId, title });
    return reply.status(201).send({ id, ok: true });
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
