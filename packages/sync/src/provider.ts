// Doc registry: one live Y.Doc per room, reused across callers so the UI's
// `useY` subscriptions and every mutation share the same in-memory doc. There
// is exactly one content doc per user, keyed by the user's id — the room is
// `boardly:board:{userId}` (== the sync-server room). Client-only (needs
// IndexedDB).
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

import { attachIndexedDb, requestPersistentStorage } from "./persistence";

const PREFIX = "boardly";

export const boardRoom = (userId: string): string => `${PREFIX}:board:${userId}`;

/**
 * Server document name (the Hocuspocus room on `/sync`). NOT the local
 * IndexedDB room key above — the server authz layer parses `board:<id>` and
 * authorizes it iff the id equals the requesting user's id, so the network
 * provider uses this.
 */
export const boardDocName = (userId: string): string => `board:${userId}`;

export interface DocHandle {
  doc: Y.Doc;
  room: string;
  whenSynced: Promise<void>;
  /** Detach persistence, destroy the doc, and drop it from the registry. */
  destroy: () => void;
}

const registry = new Map<string, DocHandle>();

function createHandle(room: string): DocHandle {
  const doc = new Y.Doc();
  const { persistence, whenSynced } = attachIndexedDb(doc, room);
  // Fire-and-forget; harmless where unsupported. Network provider: Phase 3.
  void requestPersistentStorage();
  return {
    doc,
    room,
    whenSynced,
    destroy: () => {
      if (persistence) void persistence.destroy();
      doc.destroy();
      registry.delete(room);
    },
  };
}

/** Get (or create) the shared doc handle for a room. */
export function getDoc(room: string): DocHandle {
  let handle = registry.get(room);
  if (!handle) {
    handle = createHandle(room);
    registry.set(room, handle);
  }
  return handle;
}

export const getBoardDoc = (userId: string): DocHandle => getDoc(boardRoom(userId));

// ---------------------------------------------------------------------------
// Network provider (Unit 3.6): attach the doc to the /sync server.
// ---------------------------------------------------------------------------

export interface NetworkHandle {
  destroy: () => void;
}

interface ProviderConfig {
  url: string;
  name: string;
  document: Y.Doc;
  /** Called on every (re)connect → re-mints a single-use ticket. */
  token: () => Promise<string>;
  onAuthenticationFailed?: () => void;
}

export interface AttachNetworkOptions {
  /** Server document name, e.g. `board:<userId>` (use `boardDocName`). */
  documentName: string;
  /** WebSocket base URL of the sync server, e.g. `ws://localhost:8787/sync`. */
  url: string;
  /** Mint a fresh single-use ticket for `documentName` (POST /sync/ticket). */
  getTicket: (documentName: string) => Promise<string>;
  /** Notified when the server rejects auth (e.g. session expired). */
  onAuthFailed?: () => void;
  /** Injectable for tests; defaults to a real HocuspocusProvider. */
  createProvider?: (config: ProviderConfig) => NetworkHandle;
}

function defaultCreateProvider(config: ProviderConfig): NetworkHandle {
  const provider = new HocuspocusProvider({
    url: config.url,
    name: config.name,
    document: config.document,
    // A function token is re-invoked by the provider on each (re)connect, so a
    // reconnect automatically mints a fresh ticket — no manual reconnect logic.
    token: config.token,
    onAuthenticationFailed: () => config.onAuthenticationFailed?.(),
  });
  return { destroy: () => provider.destroy() };
}

/**
 * Attach a Yjs doc to the sync server — but only AFTER local IndexedDB has
 * hydrated (`handle.whenSynced`), so the UI renders local state first with no
 * content flash. The provider carries a per-connect ticket; an auth rejection
 * fires `onAuthFailed` and does not enter a reconnect loop (the server closes
 * with a terminal Forbidden code).
 */
export async function attachNetwork(
  handle: DocHandle,
  options: AttachNetworkOptions,
): Promise<NetworkHandle> {
  await handle.whenSynced;
  const create = options.createProvider ?? defaultCreateProvider;
  return create({
    url: options.url,
    name: options.documentName,
    document: handle.doc,
    token: () => options.getTicket(options.documentName),
    onAuthenticationFailed: options.onAuthFailed,
  });
}
