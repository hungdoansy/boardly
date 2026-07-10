import { eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { boards } from "../db/schema";
import type { TicketStore } from "./ticket-store";

/** Thrown for any authorization failure — Hocuspocus closes the socket pre-sync. */
export class SyncUnauthorizedError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "SyncUnauthorizedError";
  }
}

/** A Yjs document name maps to either one board or a user's workspace room. */
export type DocRef = { type: "board"; boardId: string } | { type: "workspace"; userId: string };

/** `board:<boardId>` / `workspace:<userId>` → structured ref (or null if unknown). */
export function parseDocumentName(name: string): DocRef | null {
  const idx = name.indexOf(":");
  if (idx === -1) return null;
  const prefix = name.slice(0, idx);
  const id = name.slice(idx + 1);
  if (!id) return null;
  if (prefix === "board") return { type: "board", boardId: id };
  if (prefix === "workspace") return { type: "workspace", userId: id };
  return null;
}

export interface SyncAuthDeps {
  db: Database;
  ticketStore: TicketStore;
  allowedOrigins: Set<string>;
}

export interface AuthenticateInput {
  token: string;
  documentName: string;
  origin: string | null | undefined;
}

/**
 * Authorize a sync connection, in order:
 *  1. Origin must be absent (non-browser) or allow-listed.
 *  2. The ticket must be valid and unused (consumed here — one-time).
 *  3. The document must belong to the ticket's user: a `board:` doc requires
 *     `board.ownerId === userId`; a `workspace:` doc requires it be the user's own.
 * Throws {@link SyncUnauthorizedError} on any failure (before any sync happens).
 */
export async function authenticateConnection(
  deps: SyncAuthDeps,
  { token, documentName, origin }: AuthenticateInput,
): Promise<{ userId: string }> {
  // Check origin first so a bad origin never burns a ticket.
  if (origin && !deps.allowedOrigins.has(origin)) {
    throw new SyncUnauthorizedError("origin not allowed");
  }

  const consumed = deps.ticketStore.consume(token);
  if (!consumed) throw new SyncUnauthorizedError("invalid or expired ticket");

  const ref = parseDocumentName(documentName);
  if (!ref) throw new SyncUnauthorizedError("unknown document");

  if (ref.type === "workspace") {
    if (ref.userId !== consumed.userId) throw new SyncUnauthorizedError("forbidden");
    return { userId: consumed.userId };
  }

  const [board] = await deps.db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, ref.boardId))
    .limit(1);
  if (!board || board.ownerId !== consumed.userId) {
    throw new SyncUnauthorizedError("forbidden");
  }
  return { userId: consumed.userId };
}
