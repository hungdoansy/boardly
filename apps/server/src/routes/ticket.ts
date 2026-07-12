import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { parseDocumentName } from "../sync/authz";
import { DEFAULT_TICKET_TTL_MS, type TicketStore } from "../sync/ticket-store";

const bodySchema = z.object({ documentName: z.string().min(1).max(200) });

export interface TicketRoutesOptions {
  db: Database;
  ticketStore: TicketStore;
  keys: TokenKeys;
}

/**
 * `POST /sync/ticket` — exchange a Bearer access token for a single-use,
 * short-lived WebSocket ticket bound to `{userId, documentName}`. The caller
 * must own the document (their own `board:<userId>` doc). The client then
 * opens the `/sync` WebSocket presenting the ticket (browsers can't set an auth
 * header on the upgrade). Re-minted on every (re)connect.
 */
export async function ticketRoutes(app: FastifyInstance, opts: TicketRoutesOptions): Promise<void> {
  const { ticketStore, keys } = opts;

  app.post("/sync/ticket", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.status(401).send({ error: "unauthorized" });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request" });
    const ref = parseDocumentName(parsed.data.documentName);
    if (!ref) return reply.status(400).send({ error: "invalid request" });

    // Authorize the document for this user (same rule the sync server enforces):
    // the content doc is keyed by the user id, so the parsed id must be the
    // caller's own — no ownership-table lookup.
    if (ref.boardId !== userId) return reply.status(403).send({ error: "forbidden" });

    const ticket = ticketStore.issue(userId, parsed.data.documentName);
    return reply.send({ ticket, expiresInMs: DEFAULT_TICKET_TTL_MS });
  });
}
