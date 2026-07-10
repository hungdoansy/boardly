import { Database as HocuspocusDatabase } from "@hocuspocus/extension-database";
import { eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { yjsDocuments } from "../db/schema";

/** Load a document's persisted Yjs state (full snapshot), or null if new. */
export async function loadDocState(db: Database, documentName: string): Promise<Uint8Array | null> {
  const [row] = await db
    .select({ state: yjsDocuments.state })
    .from(yjsDocuments)
    .where(eq(yjsDocuments.docName, documentName))
    .limit(1);
  return row?.state ?? null;
}

/** Upsert a document's Yjs state snapshot. */
export async function storeDocState(
  db: Database,
  documentName: string,
  state: Uint8Array,
): Promise<void> {
  const now = new Date();
  await db
    .insert(yjsDocuments)
    .values({ docName: documentName, state, updatedAt: now })
    .onConflictDoUpdate({ target: yjsDocuments.docName, set: { state, updatedAt: now } });
}

/**
 * Hocuspocus persistence over Postgres `yjs_documents`. Snapshot strategy:
 * Hocuspocus debounces `store` and hands us the full encoded state, which we
 * upsert as `bytea` — simple and correct; append+compact is unnecessary at this
 * scale and would complicate the read path.
 */
export function createDatabaseExtension(db: Database): HocuspocusDatabase {
  return new HocuspocusDatabase({
    fetch: ({ documentName }) => loadDocState(db, documentName),
    store: ({ documentName, state }) => storeDocState(db, documentName, state),
  });
}
