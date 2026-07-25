"use client";

import { type Status, STATUS_META } from "@boardly/domain";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@boardly/ui";
import { Archive, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { useCardActions } from "../../lib/use-board";

/**
 * The column header's 3-dots ("more") menu. Its one action, "Archive all",
 * archives every card currently visible in the column — the ids the board passes
 * in are already scoped to the active filter, so the confirmation count matches
 * the header count exactly. Archiving routes through the command-backed
 * `archiveMany` (agent-native parity). Renders nothing for an empty column:
 * there is nothing to archive and no other menu item yet.
 */
export function ColumnMenu({
  status,
  visibleCardIds,
}: {
  status: Status;
  visibleCardIds: string[];
}) {
  const actions = useCardActions();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const count = visibleCardIds.length;
  if (count === 0) return null;

  const statusName = STATUS_META[status].name;
  const noun = count === 1 ? "card" : "cards";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Column actions"
          title="Column actions"
          className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=open]:bg-hover data-[state=open]:text-fg"
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
            <Archive className="size-3.5 text-fg-faint" aria-hidden="true" />
            Archive all
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              Archive all {count} {noun} in {statusName}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            This removes {count === 1 ? "it" : "them"} from the board. Archived cards aren&rsquo;t
            deleted — unlike deleting, archiving keeps them.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                actions.archiveMany(visibleCardIds);
                setConfirmOpen(false);
              }}
            >
              <Archive className="size-3.5" />
              Archive all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
