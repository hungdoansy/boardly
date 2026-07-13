"use client";

import {
  type Filter,
  type FilterContext,
  type GroupByField,
  Priority,
  STATUS_ORDER,
  countByStatus,
} from "@boardly/domain";
import { getCard } from "@boardly/sync";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

import { useAuthSession } from "../../lib/auth-store";
import { useBoardlyContext } from "../../lib/boardly-context";
import {
  useAllCards,
  useCardActions,
  useSetShowEmptyColumns,
  useShowEmptyColumns,
} from "../../lib/use-board";
import { useSelectedCard } from "../../lib/use-boards";
import { CardDetail } from "../card/card-detail";
import { ColumnCards } from "./column-cards";
import { BoardDndProvider, StatusColumn } from "./dnd";
import { focusCard, useBoardKeyboardNav } from "./keyboard-nav";
import { Swimlanes } from "./swimlanes";

const PRIORITY_CYCLE = Object.values(Priority).sort((a, b) => a - b);

export function BoardView({
  filter,
  groupBy,
}: {
  filter?: Filter;
  groupBy?: GroupByField | null;
}) {
  const allCards = useAllCards();
  const cardActions = useCardActions();
  const showEmptyColumns = useShowEmptyColumns();
  const setShowEmptyColumns = useSetShowEmptyColumns();
  const [openCardId, setOpenCardId] = useSelectedCard();
  const { userId } = useAuthSession();
  const filterCtx: FilterContext = useMemo(
    () => ({ now: Date.now(), currentUserId: userId ?? undefined }),
    [userId],
  );

  // Per-status counts under the ACTIVE filter (Unit 9.6), so both the header
  // counts and the hide-empty toggle agree with what each column renders.
  const counts = useMemo(
    () => countByStatus(allCards, filter, filterCtx),
    [allCards, filter, filterCtx],
  );

  // Fixed columns: the eight statuses in STATUS_ORDER. When "hide empty" is on,
  // drop columns with no cards *matching the active filter* — a status whose
  // cards are all filtered out hides too.
  const visibleStatuses = useMemo(
    () => (showEmptyColumns ? STATUS_ORDER : STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0)),
    [showEmptyColumns, counts],
  );

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
      <div className="flex h-full flex-col">
        <div className="flex h-9 shrink-0 items-center justify-end border-b border-line-subtle px-4">
          <button
            type="button"
            aria-pressed={!showEmptyColumns}
            onClick={() => setShowEmptyColumns(!showEmptyColumns)}
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {showEmptyColumns ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {showEmptyColumns ? "Hide empty columns" : "Show empty columns"}
          </button>
        </div>
        <div ref={boardRef} className="flex flex-1 items-start gap-3 overflow-x-auto p-4">
          {visibleStatuses.map((status) => (
            <StatusColumn key={status} status={status} count={counts[status] ?? 0}>
              <ColumnCards
                status={status}
                onOpenCard={setOpenCardId}
                filter={filter}
                filterCtx={filterCtx}
              />
            </StatusColumn>
          ))}
        </div>
      </div>

      <CardDetail cardId={openCardId} onClose={closeCard} />
    </BoardDndProvider>
  );
}
