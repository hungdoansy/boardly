"use client";

import { isDoneStatus, Status, STATUS_META } from "@boardly/domain";
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
  StatusIcon,
  type StatusVariant,
} from "@boardly/ui";
import { Archive, Check, EyeOff, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { setColumnHidden } from "../../lib/hidden-columns";
import { useCardActions } from "../../lib/use-board";

/** Which bulk action is awaiting confirmation (at most one dialog is ever open). */
type PendingBulk = "done" | "archive" | null;

/*
 * The confirmation bodies are built as strings, not written as JSX prose.
 *
 * A JSX text run that wraps onto a second source line loses the space that
 * preceded it, so `…{it ? "it" : "them"} from the board. <wraps here> …` renders
 * as "themfrom the board" — and Prettier deletes the `{" "}` that would fix it,
 * because Babel's whitespace rules (which Prettier models) say the space
 * survives. A template literal keeps the compiler out of the copy entirely.
 */
const doneBody = (count: number): string =>
  `This moves ${count === 1 ? "it" : "them"} to the Done column. ` +
  `Cards hidden by the current filter aren’t touched.`;

const archiveBody = (count: number): string =>
  `This removes ${count === 1 ? "it" : "them"} from the board. ` +
  `Archived cards aren’t deleted — unlike deleting, archiving keeps them.`;

/**
 * The column header's 3-dots ("more") menu.
 *
 * The two bulk actions — "Mark all done" and "Archive all" — operate on exactly
 * the cards currently visible in the column: the ids the board passes in are
 * already scoped to the active filter, so filtered-out cards are never touched
 * and the confirmation count matches the header count. Both route through the
 * command layer (`setStatusMany` / `archiveMany`) for agent-native parity, and
 * both confirm first because they mutate many cards at once.
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
  const [pending, setPending] = useState<PendingBulk>(null);
  const close = (): void => setPending(null);

  const count = visibleCardIds.length;
  const statusName = STATUS_META[status].name;
  const noun = count === 1 ? "card" : "cards";
  // Marking a Done column done is a no-op, so the item only makes sense
  // elsewhere. Canceled/Duplicate keep it — reviving a dropped card as done is a
  // real (if rarer) intent.
  const canMarkDone = count > 0 && !isDoneStatus(status);

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
          {canMarkDone ? (
            <DropdownMenuItem onSelect={() => setPending("done")}>
              <StatusIcon
                variant={Status.Done as StatusVariant}
                color={STATUS_META[Status.Done].color}
              />
              Mark all done
            </DropdownMenuItem>
          ) : null}
          {count > 0 ? (
            <>
              <DropdownMenuItem onSelect={() => setPending("archive")}>
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

      <Dialog open={pending === "done"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              Mark all {count} {noun} in {statusName} as done?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">{doneBody(count)}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                actions.setStatusMany(visibleCardIds, Status.Done);
                close();
              }}
            >
              <Check className="size-3.5" />
              Mark all done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pending === "archive"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              Archive all {count} {noun} in {statusName}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">{archiveBody(count)}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                actions.archiveMany(visibleCardIds);
                close();
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
