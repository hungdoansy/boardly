"use client";

import { cn } from "@boardly/ui";
import type { WorkspaceBoardRef } from "@boardly/domain";
import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useBoardActions, useBoards, useSelectedBoard } from "../../lib/use-boards";

export function BoardList() {
  const boards = useBoards();
  const actions = useBoardActions();
  const [selected, select] = useSelectedBoard();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = (): void => {
    const id = actions.create();
    select(id);
  };

  return (
    <nav className="flex min-h-0 flex-1 flex-col px-2" aria-label="Boards">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">Boards</span>
        <button
          type="button"
          aria-label="New board"
          onClick={handleCreate}
          className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {boards.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-fg-faint">
          No boards yet. Create your first one.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {boards.map((board) => (
            <li key={board.id}>
              <BoardRow
                board={board}
                active={board.id === selected}
                editing={editingId === board.id}
                onSelect={() => select(board.id)}
                onStartRename={() => setEditingId(board.id)}
                onCommitRename={(title) => {
                  actions.rename(board.id, title);
                  setEditingId(null);
                }}
                onCancelRename={() => setEditingId(null)}
                onArchive={() => {
                  actions.archive(board.id);
                  if (selected === board.id) select(null);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

interface BoardRowProps {
  board: WorkspaceBoardRef;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
  onArchive: () => void;
}

function BoardRow({
  board,
  active,
  editing,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onArchive,
}: BoardRowProps) {
  const [draft, setDraft] = useState(board.title);
  useEffect(() => {
    if (editing) setDraft(board.title);
  }, [editing, board.title]);

  if (editing) {
    const commit = (): void => onCommitRename(draft.trim() || board.title);
    return (
      <input
        autoFocus
        aria-label="Board name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onCancelRename();
        }}
        className="h-7 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-base text-fg outline-none ring-1 ring-[var(--accent)]"
      />
    );
  }

  return (
    <div
      className={cn(
        "group flex h-7 items-center gap-1 rounded-[var(--radius-sm)] pr-1 transition-colors duration-[var(--dur-fast)]",
        active ? "bg-selected" : "hover:bg-overlay",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onStartRename}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-base text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:text-fg"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            active ? "bg-[var(--accent)]" : "bg-[var(--text-tertiary)]",
          )}
        />
        <span className="truncate">{board.title}</span>
      </button>
      <button
        type="button"
        aria-label={`Archive ${board.title}`}
        onClick={onArchive}
        className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
