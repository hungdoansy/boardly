"use client";

import {
  useCardActions,
  useCardCounts,
  useColumnActions,
  useColumns,
  useReclaimedCards,
} from "../../lib/use-board";
import { CardFace } from "../card/card";
import { AddColumn } from "./add-column";
import { BoardColumn } from "./column";
import { ColumnCards } from "./column-cards";

export function BoardView({ boardId }: { boardId: string }) {
  const columns = useColumns(boardId);
  const counts = useCardCounts(boardId);
  const reclaimed = useReclaimedCards(boardId);
  const columnActions = useColumnActions(boardId);
  const cardActions = useCardActions(boardId);

  return (
    <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
      {columns.map((column) => (
        <BoardColumn
          key={column.id}
          column={column}
          count={counts[column.id] ?? 0}
          onRename={(title) => columnActions.rename(column.id, title)}
          onDelete={() => columnActions.remove(column.id)}
        >
          <ColumnCards boardId={boardId} columnId={column.id} />
        </BoardColumn>
      ))}

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
                onRename={(title) => cardActions.rename(card.id, title)}
                onArchive={() => cardActions.archive(card.id)}
              />
            ))}
          </div>
        </section>
      )}

      <AddColumn onAdd={columnActions.add} />
    </div>
  );
}
