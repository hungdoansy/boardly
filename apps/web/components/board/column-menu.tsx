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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@boardly/ui";
import { Archive, EyeOff, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { setColumnHidden } from "../../lib/hidden-columns";
import { useCardActions } from "../../lib/use-board";

/**
 * The column header's 3-dots ("more") menu.
 *
 * "Archive all" archives every card currently visible in the column — the ids
 * the board passes in are already scoped to the active filter, so the
 * confirmation count matches the header count exactly. Archiving routes through
 * the command-backed `archiveMany` (agent-native parity), and confirms first
 * because it mutates card data.
 *
 * "Hide" drops the column from the board (UNIT-18). It always renders, on empty
 * columns too — an unused column is the likeliest thing to want gone. There is
 * deliberately no confirmation: hiding touches no data and the toolbar's Columns
 * menu undoes it in one click, so a dialog would imply a weight it does not have.
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
  const statusName = STATUS_META[status].name;
  const noun = count === 1 ? "card" : "cards";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${statusName} column actions`}
          title="Column actions"
          className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] data-[state=open]:bg-hover data-[state=open]:text-fg"
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {count > 0 ? (
            <>
              <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
                <Archive className="size-3.5 text-fg-faint" aria-hidden="true" />
                Archive all
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => setColumnHidden(status, true)}>
            <EyeOff className="size-3.5 text-fg-faint" aria-hidden="true" />
            Hide
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
