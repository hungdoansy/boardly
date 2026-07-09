"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@boardly/ui";
import { LayoutGrid, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useCardActions, useColumns } from "../../lib/use-board";
import { useBoardActions, useBoards, useSelectedBoard } from "../../lib/use-boards";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const boards = useBoards();
  const boardActions = useBoardActions();
  const [selected, select] = useSelectedBoard();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void): void => {
    fn();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            value="create board new"
            onSelect={() => run(() => select(boardActions.create()))}
          >
            <Plus className="size-4" />
            Create board
          </CommandItem>
          {selected ? <NewCardItem boardId={selected} onRun={() => setOpen(false)} /> : null}
        </CommandGroup>

        {boards.length > 0 ? (
          <CommandGroup heading="Jump to board">
            {boards.map((board) => (
              <CommandItem
                key={board.id}
                value={`board ${board.title}`}
                onSelect={() => run(() => select(board.id))}
              >
                <LayoutGrid className="size-4" />
                {board.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

function NewCardItem({ boardId, onRun }: { boardId: string; onRun: () => void }) {
  const columns = useColumns(boardId);
  const actions = useCardActions(boardId);
  const first = columns[0];
  if (!first) return null;
  return (
    <CommandItem
      value="new card create"
      onSelect={() => {
        actions.create(first.id, "New card");
        onRun();
      }}
    >
      <Plus className="size-4" />
      New card in “{first.title}”
    </CommandItem>
  );
}
