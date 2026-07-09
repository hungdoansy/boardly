"use client";

import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo, useState } from "react";

import {
  useCardActions,
  useCardCounts,
  useColumnActions,
  useColumns,
  useLabels,
  useReclaimedCards,
} from "../../lib/use-board";
import { CardDetail } from "../card/card-detail";
import { CardFace } from "../card/card";
import { AddColumn } from "./add-column";
import { ColumnCards } from "./column-cards";
import { BoardDndProvider, SortableColumn } from "./dnd";

export function BoardView({ boardId }: { boardId: string }) {
  const columns = useColumns(boardId);
  const counts = useCardCounts(boardId);
  const reclaimed = useReclaimedCards(boardId);
  const columnActions = useColumnActions(boardId);
  const cardActions = useCardActions(boardId);
  const labels = useLabels(boardId);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  return (
    <BoardDndProvider boardId={boardId}>
      <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
        <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {columns.map((column) => (
            <SortableColumn
              key={column.id}
              column={column}
              count={counts[column.id] ?? 0}
              onRename={(title) => columnActions.rename(column.id, title)}
              onDelete={() => columnActions.remove(column.id)}
            >
              <ColumnCards boardId={boardId} columnId={column.id} onOpenCard={setOpenCardId} />
            </SortableColumn>
          ))}
        </SortableContext>

        {reclaimed.length > 0 && (
          <section
            aria-label="Unsorted"
            className="flex max-h-full w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border border-dashed border-line bg-surface"
          >
            <header className="flex h-9 shrink-0 items-center gap-2 px-2">
              <span className="text-md font-medium text-fg-muted">Unsorted</span>
              <span className="px-1 text-xs tabular-nums text-fg-faint">{reclaimed.length}</span>
            </header>
            <div className="flex min-h-9 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
              {reclaimed.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  labels={card.labelIds
                    .map((id) => labelById.get(id))
                    .filter((l) => l !== undefined)}
                  onOpen={() => setOpenCardId(card.id)}
                  onArchive={() => cardActions.archive(card.id)}
                />
              ))}
            </div>
          </section>
        )}

        <AddColumn onAdd={columnActions.add} />
      </div>

      <CardDetail boardId={boardId} cardId={openCardId} onClose={() => setOpenCardId(null)} />
    </BoardDndProvider>
  );
}
