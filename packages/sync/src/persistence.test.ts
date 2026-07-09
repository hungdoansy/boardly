import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { addColumn, initBoard, liveColumns } from "./board-doc";
import { attachIndexedDb } from "./persistence";

const NOW = 1_700_000_000_000;

// fake-indexeddb/auto is installed by the shared vitest setup.
describe("indexeddb persistence", () => {
  it("persists writes and reloads them into a fresh doc", async () => {
    const room = "boardly:test:persist-roundtrip";

    const doc1 = new Y.Doc();
    const { whenSynced: s1, persistence: p1 } = attachIndexedDb(doc1, room);
    await s1;
    initBoard(doc1, { title: "Persisted", now: NOW });
    addColumn(doc1, { title: "Col A", now: NOW, clientId: "1" });
    // y-indexeddb flushes updates asynchronously; let the store settle.
    await new Promise((r) => setTimeout(r, 50));

    const doc2 = new Y.Doc();
    const { whenSynced: s2, persistence: p2 } = attachIndexedDb(doc2, room);
    await s2;

    expect(liveColumns(doc2).map((c) => c.title)).toEqual(["Col A"]);

    await p1.destroy();
    await p2.destroy();
  });

  it("hydrates an empty doc without error", async () => {
    const doc = new Y.Doc();
    const { whenSynced, persistence } = attachIndexedDb(doc, "boardly:test:empty");
    await whenSynced;
    expect(liveColumns(doc)).toEqual([]);
    await persistence.destroy();
  });
});
