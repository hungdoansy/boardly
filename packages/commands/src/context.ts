// The CommandContext abstracts doc access so a command is written once and runs
// unchanged on the client (in-memory Y.Doc from the sync provider registry) and
// on the server (a Hocuspocus direct connection, added in Unit 3.9). `now` and
// `clientId` are injected here so command logic stays deterministic/testable.
import * as Y from "yjs";

export interface CommandContext {
  /** The caller's single board doc, resolved from the authenticated user (persists + broadcasts on the server). */
  getBoardDoc(): Y.Doc;
  /** Tie-breaker for fractional ordering (typically the Yjs clientID as string). */
  clientId: string;
  /** Timestamp source (injected: Date.now on the client, server clock on the server). */
  now(): number;
  userId?: string;
}

export interface MemoryContext extends CommandContext {
  /** All docs created by this context, keyed by room — handy in tests. */
  docs: Map<string, Y.Doc>;
}

export interface MemoryContextOptions {
  userId?: string;
  clientId?: string;
  now?: () => number;
}

/**
 * An in-memory CommandContext with no persistence — used by tests and any
 * headless caller. The single per-user board doc lives only in the returned
 * `docs` map (keyed by room, so distinct user ids resolve distinct docs).
 */
export function createMemoryContext(options: MemoryContextOptions = {}): MemoryContext {
  const docs = new Map<string, Y.Doc>();
  const userId = options.userId ?? "me";
  const get = (room: string): Y.Doc => {
    let doc = docs.get(room);
    if (!doc) {
      doc = new Y.Doc();
      docs.set(room, doc);
    }
    return doc;
  };
  return {
    docs,
    getBoardDoc: () => get(`board:${userId}`),
    clientId: options.clientId ?? "mem",
    now: options.now ?? (() => 0),
    userId,
  };
}
