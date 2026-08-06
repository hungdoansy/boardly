"use client";

import { type Filter, type FilterContext, type Status, countByStatus } from "@boardly/domain";
import { useMemo } from "react";

import { useAuthSession } from "./auth-store";
import { useAllCards } from "./use-board";

/**
 * The context every filter clause is evaluated against: `now` for relative-date
 * clauses, the signed-in user for `me` clauses. Memoized per user so ordinary
 * re-renders don't re-evaluate date clauses against a moving `now`.
 */
export function useFilterContext(): FilterContext {
  const { userId } = useAuthSession();
  return useMemo(() => ({ now: Date.now(), currentUserId: userId ?? undefined }), [userId]);
}

/**
 * Per-status card counts under the *active* filter: the number a column header
 * shows, and the number the Columns menu shows for a column that is not on
 * screen. Shared because those two now live in different subtrees — the menu in
 * the app header, the columns in the board — and a disagreement between them
 * would break the "where did my card go?" story hiding depends on (UNIT-18).
 */
export function useStatusCounts(filter?: Filter): Record<Status, number> {
  const allCards = useAllCards();
  const filterCtx = useFilterContext();
  return useMemo(() => countByStatus(allCards, filter, filterCtx), [allCards, filter, filterCtx]);
}
