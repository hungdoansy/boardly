"use client";

import { cn } from "@boardly/ui";
import { useBoards, useSelectedBoard } from "../../lib/use-boards";

/**
 * Single-board sidebar (Unit 2): lists the one auto-provisioned board. No create
 * or archive affordances — Boardly is locked to a single main board. (Unit 7
 * grows this sidebar with the project list.)
 */
export function BoardList() {
  const boards = useBoards();
  const [selected, select] = useSelectedBoard();

  return (
    <nav className="flex shrink-0 flex-col px-2" aria-label="Boards">
      <div className="flex items-center px-1 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-faint">Board</span>
      </div>

      <ul className="flex flex-col gap-0.5 overflow-y-auto">
        {boards.map((board) => (
          <li key={board.id}>
            <button
              type="button"
              onClick={() => select(board.id)}
              className={cn(
                "flex h-7 w-full min-w-0 items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-left text-base transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                board.id === selected ? "bg-selected text-fg" : "text-fg-muted hover:bg-hover",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  board.id === selected ? "bg-[var(--accent)]" : "bg-[var(--text-tertiary)]",
                )}
              />
              <span className="truncate">{board.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
