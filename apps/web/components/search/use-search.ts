"use client";

import { allLiveCards, listLabels } from "@boardly/sync";
import { useEffect, useMemo, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import { useBoards } from "../../lib/use-boards";
import type { SearchDoc } from "./search-index";

/**
 * A live, flattened index of every non-archived card across all boards, for
 * search. Rebuilds when the board set changes or any board doc mutates (so
 * results track edits, per the plan). One `update` subscription per board doc,
 * torn down when the board set changes.
 */
export function useSearchDocs(): SearchDoc[] {
  const ctx = useBoardlyContext();
  const boards = useBoards();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const docs = boards.map((b) => ctx.getBoardDoc(b.id));
    const bump = (): void => setVersion((v) => v + 1);
    for (const doc of docs) doc.on("update", bump);
    return () => {
      for (const doc of docs) doc.off("update", bump);
    };
  }, [ctx, boards]);

  return useMemo(() => {
    const out: SearchDoc[] = [];
    for (const board of boards) {
      const doc = ctx.getBoardDoc(board.id);
      const labelName = new Map(listLabels(doc).map((l) => [l.id, l.name]));
      for (const card of allLiveCards(doc)) {
        out.push({
          cardId: card.id,
          boardId: board.id,
          boardTitle: board.title,
          title: card.title,
          description: card.description,
          shortId: card.shortId,
          labels: card.labelIds
            .map((id) => labelName.get(id))
            .filter((n): n is string => n !== undefined),
          updatedAt: card.updatedAt,
        });
      }
    }
    return out;
    // `version` intentionally participates: a doc mutation bumps it to recompute.
  }, [ctx, boards, version]);
}
