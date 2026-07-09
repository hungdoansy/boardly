// Local, offline-first persistence via y-indexeddb. One code path for both the
// web app and the Tauri webview (both have IndexedDB). The network provider is
// intentionally NOT attached here — it lands in Phase 3; startup order is
// create doc → attach IndexedDB → await whenSynced → render → (later) attach ws.
import { IndexeddbPersistence } from "y-indexeddb";
import type * as Y from "yjs";

export interface LocalPersistence {
  persistence: IndexeddbPersistence;
  /** Resolves once the doc has hydrated from IndexedDB (empty on first run). */
  whenSynced: Promise<void>;
}

/** Attach IndexedDB persistence to a doc for the given room. */
export function attachIndexedDb(doc: Y.Doc, room: string): LocalPersistence {
  const persistence = new IndexeddbPersistence(room, doc);
  const whenSynced = persistence.whenSynced.then(() => undefined);
  return { persistence, whenSynced };
}

let persistRequested = false;

/**
 * Ask the browser to keep our IndexedDB data from being evicted. Called once;
 * a no-op (resolves false) where the API is unavailable (SSR/node/tests).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return false;
  persistRequested = true;
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
