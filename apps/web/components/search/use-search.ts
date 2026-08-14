"use client";

import {
  allLiveCards,
  getBoard,
  listArchivedProjects,
  listLabels,
  listProjects,
} from "@boardly/sync";
import { useEffect, useMemo, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import type { SearchDoc } from "./search-index";

export interface SearchDocsOptions {
  /**
   * Include cards belonging to hidden (archived) projects. Off by default, so
   * both search surfaces inherit the exclusion from here (UNIT-20, R4); each
   * one flips it from its own per-open toggle.
   */
  includeHidden?: boolean;
}

/**
 * A live, flattened index of every non-archived card on the per-user board, for
 * search. Rebuilds when the board doc mutates (so results track edits, per the
 * plan) via a single `update` subscription.
 */
export function useSearchDocs({ includeHidden = false }: SearchDocsOptions = {}): SearchDoc[] {
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
    // Names come from *both* project lists. A hidden project is absent from
    // `listProjects` — the list every other card surface reads — so resolving
    // from it alone would leave the name undefined for exactly the cards that
    // need to be marked with it (UNIT-20, KTD6).
    const archived = listArchivedProjects(doc);
    const hiddenIds = new Set(archived.map((p) => p.id));
    const projectName = new Map(
      [...listProjects(doc), ...archived].map((p) => [p.id, p.name] as const),
    );
    const out: SearchDoc[] = [];
    for (const card of allLiveCards(doc)) {
      const projectHidden = card.projectId !== undefined && hiddenIds.has(card.projectId);
      if (projectHidden && !includeHidden) continue;
      out.push({
        cardId: card.id,
        boardTitle,
        title: card.title,
        description: card.description,
        shortId: card.shortId,
        labels: card.labelIds
          .map((id) => labelName.get(id))
          .filter((n): n is string => n !== undefined),
        projectId: card.projectId,
        projectName: card.projectId === undefined ? undefined : projectName.get(card.projectId),
        projectHidden,
        updatedAt: card.updatedAt,
      });
    }
    return out;
    // `version` intentionally participates: a doc mutation bumps it to recompute.
  }, [ctx, version, includeHidden]);
}
