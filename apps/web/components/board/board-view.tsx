"use client";

import { type Filter, type FilterContext, evaluateFilter, Priority } from "@boardly/domain";
import { getCard } from "@boardly/sync";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useCallback, useMemo, useRef } from "react";

import { useAuthSession } from "../../lib/auth-store";
import { useBoardlyContext } from "../../lib/boardly-context";
import {
  useBadgeConfig,
  useCardActions,
  useCardCounts,
  useColumnActions,
  useColumns,
  useLabels,
  useReclaimedCards,
} from "../../lib/use-board";
import { useSelectedCard } from "../../lib/use-boards";
import { CardDetail } from "../card/card-detail";
import { CardFace } from "../card/card";
import { AddColumn } from "./add-column";
import { ColumnCards } from "./column-cards";
import { BoardDndProvider, SortableColumn } from "./dnd";
import { focusCard, useBoardKeyboardNav } from "./keyboard-nav";

const PRIORITY_CYCLE = Object.values(Priority).sort((a, b) => a - b);

export function BoardView({ boardId, filter }: { boardId: string; filter?: Filter }) {
  const columns = useColumns(boardId);
  const counts = useCardCounts(boardId);
  const reclaimed = useReclaimedCards(boardId);
  const columnActions = useColumnActions(boardId);
  const cardActions = useCardActions(boardId);
  const labels = useLabels(boardId);
  const config = useBadgeConfig(boardId);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const [openCardId, setOpenCardId] = useSelectedCard();
  const { userId } = useAuthSession();
  const filterCtx: FilterContext = useMemo(
    () => ({ now: Date.now(), currentUserId: userId ?? undefined }),
    [userId],
  );
  const filteredReclaimed = useMemo(
    () => (filter ? reclaimed.filter((c) => evaluateFilter(c, filter, filterCtx)) : reclaimed),
    [reclaimed, filter, filterCtx],
  );

  const ctx = useBoardlyContext();
  const boardRef = useRef<HTMLDivElement>(null);
  const cyclePriority = useCallback(
    (cardId: string) => {
      const card = getCard(ctx.getBoardDoc(boardId), cardId);
      if (!card) return;
      const current = card.priority ?? Priority.None;
      const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(current) + 1) % PRIORITY_CYCLE.length]!;
      cardActions.setPriority(cardId, next);
    },
    [ctx, boardId, cardActions],
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

  return (
    <BoardDndProvider boardId={boardId}>
      <div ref={boardRef} className="flex h-full items-start gap-3 overflow-x-auto p-4">
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => (
            <SortableColumn
              key={column.id}
              column={column}
              count={counts[column.id] ?? 0}
              onRename={(title) => columnActions.rename(column.id, title)}
              onDelete={() => columnActions.remove(column.id)}
            >
              <ColumnCards
                boardId={boardId}
                columnId={column.id}
                onOpenCard={setOpenCardId}
                filter={filter}
                filterCtx={filterCtx}
              />
            </SortableColumn>
          ))}
        </SortableContext>

        {filteredReclaimed.length > 0 && (
          <section
            aria-label="Unsorted"
            className="flex max-h-full w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border border-dashed border-line bg-surface"
          >
            <header className="flex h-9 shrink-0 items-center gap-2 px-2">
              <span className="text-md font-medium text-fg-muted">Unsorted</span>
              <span className="px-1 text-xs tabular-nums text-fg-faint">
                {filteredReclaimed.length}
              </span>
            </header>
            <div className="flex min-h-9 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
              {filteredReclaimed.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  labels={card.labelIds
                    .map((id) => labelById.get(id))
                    .filter((l) => l !== undefined)}
                  config={config}
                  onOpen={() => setOpenCardId(card.id)}
                  onArchive={() => cardActions.archive(card.id)}
                />
              ))}
            </div>
          </section>
        )}

        <AddColumn onAdd={columnActions.add} />
      </div>

      <CardDetail boardId={boardId} cardId={openCardId} onClose={closeCard} />
    </BoardDndProvider>
  );
}
