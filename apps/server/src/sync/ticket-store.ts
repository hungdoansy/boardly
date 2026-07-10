import { randomBytes } from "node:crypto";

/**
 * One-time, short-lived WebSocket tickets. A browser can't send an
 * `Authorization` header on a WS upgrade, so the client first exchanges its
 * access token for a ticket over HTTP (endpoint arrives in Unit 3.6), then
 * presents the ticket on connect. Tickets are single-use and expire fast, so a
 * leaked ticket is near-useless.
 */
interface Ticket {
  userId: string;
  documentName: string;
  expiresAt: number;
}

export interface TicketGrant {
  userId: string;
  documentName: string;
}

export interface TicketStore {
  /** Issue a single-use ticket bound to a user AND a specific document. */
  issue(userId: string, documentName: string, ttlMs?: number): string;
  /** Consume a ticket: returns the bound grant once, then never again. */
  consume(token: string): TicketGrant | null;
  /** Number of live (unconsumed) tickets — for tests/metrics. */
  size(): number;
}

export const DEFAULT_TICKET_TTL_MS = 30_000;

export function createTicketStore(defaultTtlMs = DEFAULT_TICKET_TTL_MS): TicketStore {
  const tickets = new Map<string, Ticket>();

  return {
    issue(userId, documentName, ttlMs = defaultTtlMs) {
      const token = randomBytes(32).toString("base64url");
      tickets.set(token, { userId, documentName, expiresAt: Date.now() + ttlMs });
      return token;
    },
    consume(token) {
      const ticket = tickets.get(token);
      if (!ticket) return null;
      tickets.delete(token); // single-use: gone whether or not it was still valid
      if (ticket.expiresAt <= Date.now()) return null;
      return { userId: ticket.userId, documentName: ticket.documentName };
    },
    size() {
      return tickets.size;
    },
  };
}
