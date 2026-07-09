import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { addBoardRef, archiveBoardRef, listBoards, renameBoardRef } from "./workspace-doc";

describe("workspace boards", () => {
  it("adds, lists in order, renames, and archives board refs", () => {
    const doc = new Y.Doc();
    const a = addBoardRef(doc, { title: "Alpha", clientId: "1" });
    const b = addBoardRef(doc, { title: "Beta", clientId: "1" });

    expect(listBoards(doc).map((x) => x.id)).toEqual([a, b]);

    renameBoardRef(doc, a, "Alpha!");
    expect(listBoards(doc).find((x) => x.id === a)?.title).toBe("Alpha!");

    archiveBoardRef(doc, b);
    expect(listBoards(doc).map((x) => x.id)).toEqual([a]);
  });
});
