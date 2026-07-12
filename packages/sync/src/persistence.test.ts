import { Status } from "@boardly/domain";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { addCard, allLiveCards, initBoard } from "./board-doc";
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
    addCard(doc1, { status: Status.Todo, title: "Card A", now: NOW, clientId: "1" });
    // y-indexeddb flushes updates asynchronously; let the store settle.
    await new Promise((r) => setTimeout(r, 50));

    const doc2 = new Y.Doc();
    const { whenSynced: s2, persistence: p2 } = attachIndexedDb(doc2, room);
    await s2;

    expect(allLiveCards(doc2).map((c) => c.title)).toEqual(["Card A"]);

    await p1?.destroy();
    await p2?.destroy();
  });

  it("hydrates an empty doc without error", async () => {
    const doc = new Y.Doc();
    const { whenSynced, persistence } = attachIndexedDb(doc, "boardly:test:empty");
    await whenSynced;
    expect(allLiveCards(doc)).toEqual([]);
    await persistence?.destroy();
  });
});
