"use client";

import {
  type Filter,
  type GroupByField,
  Priority,
  STATUS_ORDER,
  visibleCardIdsByStatus,
} from "@boardly/domain";
import { getCard } from "@boardly/sync";
import { Button } from "@boardly/ui";
import { useCallback, useMemo, useRef } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import { showAllColumns, useHiddenStatuses } from "../../lib/hidden-columns";
import { useAllCards, useCardActions, useShowEmptyColumns } from "../../lib/use-board";
import { useFilterContext, useStatusCounts } from "../../lib/use-status-counts";
import { useSelectedCard } from "../../lib/use-boards";
import { CardDetail } from "../card/card-detail";
import { ColumnCards } from "./column-cards";
import { BoardDndProvider, StatusColumn } from "./dnd";
import { focusCard, useBoardKeyboardNav } from "./keyboard-nav";
import { Swimlanes } from "./swimlanes";

const PRIORITY_CYCLE = Object.values(Priority).sort((a, b) => a - b);

export function BoardView({ filter, groupBy }: { filter?: Filter; groupBy?: GroupByField | null }) {
  const allCards = useAllCards();
  const cardActions = useCardActions();
  const showEmptyColumns = useShowEmptyColumns();
  const hiddenStatuses = useHiddenStatuses();
  const [openCardId, setOpenCardId] = useSelectedCard();
  const filterCtx = useFilterContext();

  // Per-status counts under the ACTIVE filter (Unit 9.6), so the column headers,
  // the hide-empty rule, and the header's Columns menu (same hook) all agree
  // with what each column renders.
  const counts = useStatusCounts(filter);

  // The ids each column shows under the active filter, grouped by status — same
  // filter path as the counts above, so a column's "Archive all" targets exactly
  // its visible cards (Unit 14).
  const visibleIds = useMemo(
    () => visibleCardIdsByStatus(allCards, filter, filterCtx),
    [allCards, filter, filterCtx],
  );

  // Fixed columns: the eight statuses in STATUS_ORDER, narrowed by two
  // independent rules (UNIT-18). Explicit per-column hiding is the stronger of
  // the two — turning "show empty" back on, or a card landing in a hidden
  // column, never resurrects a column the user deliberately hid. When "hide
  // empty" is on, drop columns with no cards *matching the active filter*, so a
  // status whose cards are all filtered out hides too.
  const visibleStatuses = useMemo(() => {
    const hidden = new Set(hiddenStatuses);
    return STATUS_ORDER.filter((s) => !hidden.has(s) && (showEmptyColumns || (counts[s] ?? 0) > 0));
  }, [hiddenStatuses, showEmptyColumns, counts]);

  const ctx = useBoardlyContext();
  const boardRef = useRef<HTMLDivElement>(null);
  const cyclePriority = useCallback(
    (cardId: string) => {
      const card = getCard(ctx.getBoardDoc(), cardId);
      if (!card) return;
      const current = card.priority ?? Priority.None;
      const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(current) + 1) % PRIORITY_CYCLE.length]!;
      cardActions.setPriority(cardId, next);
    },
    [ctx, cardActions],
  );
  useBoardKeyboardNav(boardRef, {
    onOpenCard: setOpenCardId,
    onArchiveCard: cardActions.archive,
    onCyclePriority: cyclePriority,
  });

  // Restore keyboard focus to the card whose detail we just closed, so an
  // Enter → edit → Esc round-trip lands the user back where they were.
  const closeCard = useCallback(() => {
    const restore = openCardId;
    setOpenCardId(null);
    if (restore && boardRef.current) {
      const root = boardRef.current;
      requestAnimationFrame(() => focusCard(root, restore));
    }
  }, [openCardId, setOpenCardId]);

  if (groupBy) {
    return (
      <>
        <Swimlanes
          groupBy={groupBy}
          filter={filter}
          filterCtx={filterCtx}
          onOpenCard={setOpenCardId}
        />
        <CardDetail cardId={openCardId} onClose={closeCard} />
      </>
    );
  }

  return (
    <BoardDndProvider>
      <div ref={boardRef} className="flex h-full items-start gap-3 overflow-x-auto p-4">
        {visibleStatuses.length === 0 ? (
          // Every column hidden. The header's Columns menu is still the real
          // escape hatch; this just says so where the user is looking.
          <div className="flex flex-1 flex-col items-center gap-3 py-16">
            <p className="text-sm text-fg-muted">Every column is hidden.</p>
            <Button variant="outline" size="sm" onClick={() => showAllColumns()}>
              Show all columns
            </Button>
          </div>
        ) : (
          visibleStatuses.map((status) => (
            <StatusColumn
              key={status}
              status={status}
              count={counts[status] ?? 0}
              visibleCardIds={visibleIds[status] ?? []}
            >
              <ColumnCards
                status={status}
                onOpenCard={setOpenCardId}
                filter={filter}
                filterCtx={filterCtx}
              />
            </StatusColumn>
          ))
        )}
      </div>

      <CardDetail cardId={openCardId} onClose={closeCard} />
    </BoardDndProvider>
  );
}
