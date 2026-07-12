"use client";

import { allLiveCards, getBoard, listLabels } from "@boardly/sync";
import { useEffect, useMemo, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import type { SearchDoc } from "./search-index";

/**
 * A live, flattened index of every non-archived card on the per-user board, for
 * search. Rebuilds when the board doc mutates (so results track edits, per the
 * plan) via a single `update` subscription.
 */
export function useSearchDocs(): SearchDoc[] {
  const ctx = useBoardlyContext();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const doc = ctx.getBoardDoc();
    const bump = (): void => setVersion((v) => v + 1);
    doc.on("update", bump);
    return () => {
      doc.off("update", bump);
    };
  }, [ctx]);

  return useMemo(() => {
    const doc = ctx.getBoardDoc();
    const boardTitle = getBoard(doc, ctx.userId ?? "").title;
    const labelName = new Map(listLabels(doc).map((l) => [l.id, l.name]));
    const out: SearchDoc[] = [];
    for (const card of allLiveCards(doc)) {
      out.push({
        cardId: card.id,
        boardTitle,
        title: card.title,
        description: card.description,
        shortId: card.shortId,
        labels: card.labelIds
          .map((id) => labelName.get(id))
          .filter((n): n is string => n !== undefined),
        updatedAt: card.updatedAt,
      });
    }
    return out;
    // `version` intentionally participates: a doc mutation bumps it to recompute.
  }, [ctx, version]);
}
