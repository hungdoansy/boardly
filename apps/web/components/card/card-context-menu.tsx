"use client";

import type { Card, PriorityValue, Status } from "@boardly/domain";
import { Priority, PRIORITY_META, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusIcon,
  type StatusVariant,
  toast,
} from "@boardly/ui";
import { Archive, Copy, ExternalLink, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useBoardlyContext } from "../../lib/boardly-context";
import { copyText } from "../../lib/clipboard";
import { useCardActions } from "../../lib/use-board";
import { buildCardHref } from "../../lib/use-boards";
import { useProjects } from "../../lib/use-projects";

const PRIORITY_ORDER: PriorityValue[] = [
  Priority.Urgent,
  Priority.High,
  Priority.Medium,
  Priority.Low,
  Priority.None,
];

const NO_PROJECT = "__none__";

/**
 * Linear-style right-click menu for a board card. Every mutating item routes
 * through the command-backed card actions (agent-native parity); "Copy link" is
 * a UI/clipboard action. Wraps its `children` (the draggable card node) as the
 * trigger via `asChild`, so left-click (open) and drag are unaffected.
 */
export function CardContextMenu({
  card,
  onOpen,
  children,
}: {
  card: Card;
  onOpen: () => void;
  children: ReactNode;
}) {
  const actions = useCardActions();
  const projects = useProjects();
  const ctx = useBoardlyContext();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const copyLink = async (): Promise<void> => {
    const ok = await copyText(buildCardHref(ctx, card.id));
    toast(ok ? "Link copied" : "Couldn't copy — copy it manually");
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onOpen}>
            <ExternalLink className="size-3.5 text-fg-faint" aria-hidden="true" />
            Open
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <StatusIcon variant={card.status as StatusVariant} color={STATUS_META[card.status].color} />
              Status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={card.status}
                onValueChange={(v) => actions.setStatus(card.id, v as Status)}
              >
                {STATUS_ORDER.map((s) => (
                  <ContextMenuRadioItem key={s} value={s}>
                    <StatusIcon variant={s as StatusVariant} color={STATUS_META[s].color} />
                    {STATUS_META[s].name}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: PRIORITY_META[card.priority].color }}
                aria-hidden="true"
              />
              Priority
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={String(card.priority)}
                onValueChange={(v) => actions.setPriority(card.id, Number(v) as PriorityValue)}
              >
                {PRIORITY_ORDER.map((p) => (
                  <ContextMenuRadioItem key={p} value={String(p)}>
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: PRIORITY_META[p].color }}
                      aria-hidden="true"
                    />
                    {PRIORITY_META[p].name}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSub>
            <ContextMenuSubTrigger>Project</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuRadioGroup
                value={card.projectId ?? NO_PROJECT}
                onValueChange={(v) =>
                  actions.setProject(card.id, v === NO_PROJECT ? null : v)
                }
              >
                <ContextMenuRadioItem value={NO_PROJECT}>No project</ContextMenuRadioItem>
                {projects.map((p) => (
                  <ContextMenuRadioItem key={p.id} value={p.id}>
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: p.color }}
                      aria-hidden="true"
                    />
                    {p.name}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={() => void copyLink()}>
            <Copy className="size-3.5 text-fg-faint" aria-hidden="true" />
            Copy link
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.archive(card.id)}>
            <Archive className="size-3.5 text-fg-faint" aria-hidden="true" />
            Archive
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete this card?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            This permanently deletes <span className="text-fg">{card.title}</span> and can&rsquo;t be
            undone. To keep it for later, archive it instead.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                actions.delete(card.id);
                setConfirmDelete(false);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
