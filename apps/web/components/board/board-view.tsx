"use client";

import {
  useCardCounts,
  useColumnActions,
  useColumns,
  useReclaimedCards,
} from "../../lib/use-board";
import { AddColumn } from "./add-column";
import { BoardColumn } from "./column";

export function BoardView({ boardId }: { boardId: string }) {
  const columns = useColumns(boardId);
  const counts = useCardCounts(boardId);
  const reclaimed = useReclaimedCards(boardId);
  const actions = useColumnActions(boardId);

  return (
    <div className="flex h-full items-start gap-3 overflow-x-auto p-4">
      {columns.map((column) => (
        <BoardColumn
          key={column.id}
          column={column}
          count={counts[column.id] ?? 0}
          onRename={(title) => actions.rename(column.id, title)}
          onDelete={() => actions.remove(column.id)}
        />
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
          <p className="px-2 pb-2 text-xs text-fg-faint">Cards from deleted columns.</p>
        </section>
      )}

      <AddColumn onAdd={actions.add} />
    </div>
  );
}
