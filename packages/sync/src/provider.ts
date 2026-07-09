// Doc registry: one live Y.Doc per room, reused across callers so the UI's
// `useY` subscriptions and every mutation share the same in-memory doc. Rooms
// are `boardly:board:{boardId}` and `boardly:workspace:{userId}` (the room ==
// the sync-server room in Phase 3). Client-only (needs IndexedDB).
import * as Y from "yjs";

import { attachIndexedDb, requestPersistentStorage } from "./persistence";

const PREFIX = "boardly";

export const boardRoom = (boardId: string): string => `${PREFIX}:board:${boardId}`;
export const workspaceRoom = (userId: string): string => `${PREFIX}:workspace:${userId}`;

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

export const getBoardDoc = (boardId: string): DocHandle => getDoc(boardRoom(boardId));
export const getWorkspaceDoc = (userId: string): DocHandle => getDoc(workspaceRoom(userId));
