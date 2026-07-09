// Typed accessors for the workspace index doc (room = `workspace:{userId}`),
// which lists a user's boards. Same conventions as board-doc.ts: id-keyed
// Y.Map, fractional `ord`, soft-delete via `archived`.
import { type WorkspaceBoardRef, byOrd, compareOrd, keyBetween, newId } from "@boardly/domain";
import * as Y from "yjs";

import { boardRefToPlain, getBool, getString, workspaceBoards } from "./schema";

function maxOrd(ords: string[]): string | null {
  let max: string | null = null;
  for (const ord of ords) {
    if (max === null || compareOrd(ord, max) > 0) max = ord;
  }
  return max;
}

export interface AddBoardRefParams {
  id?: string;
  title: string;
  icon?: string;
  clientId: string;
}

export function addBoardRef(doc: Y.Doc, params: AddBoardRefParams): string {
  const id = params.id ?? newId();
  doc.transact(() => {
    const boards = workspaceBoards(doc);
    const lastOrd = maxOrd(
      [...boards.values()].filter((b) => !getBool(b, "archived")).map((b) => getString(b, "ord")),
    );
    const ref = new Y.Map<unknown>();
    ref.set("id", id);
    ref.set("title", params.title);
    if (params.icon !== undefined) ref.set("icon", params.icon);
    ref.set("ord", keyBetween(lastOrd, null, params.clientId));
    ref.set("archived", false);
    boards.set(id, ref);
  });
  return id;
}

export function renameBoardRef(doc: Y.Doc, boardId: string, title: string): void {
  doc.transact(() => {
    const ref = workspaceBoards(doc).get(boardId);
    if (ref instanceof Y.Map) ref.set("title", title);
  });
}

export function archiveBoardRef(doc: Y.Doc, boardId: string): void {
  doc.transact(() => {
    const ref = workspaceBoards(doc).get(boardId);
    if (ref instanceof Y.Map) ref.set("archived", true);
  });
}

export function listBoards(doc: Y.Doc): WorkspaceBoardRef[] {
  return [...workspaceBoards(doc).values()]
    .filter((b) => !getBool(b, "archived"))
    .map(boardRefToPlain)
    .sort(byOrd);
}
