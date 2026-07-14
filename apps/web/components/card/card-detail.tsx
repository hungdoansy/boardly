"use client";

import type { Card } from "@boardly/domain";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@boardly/ui";
import { Archive, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useCardActions, useCardById } from "../../lib/use-board";
import { useProjects } from "../../lib/use-projects";
import { CardActivity } from "./activity";
import { Checklist } from "./checklist";
import { DueDatePicker } from "./due-date";
import { CardLabels } from "./labels";
import { CardLinks } from "./links";
import { MarkdownEditor } from "./markdown-editor";
import { PrioritySelect } from "./priority-select";
import { ProjectSelect } from "./project-select";
import { CardRelated } from "./related";
import { StatusSelect } from "./status-select";

interface CardDetailProps {
  cardId: string | null;
  onClose: () => void;
}

export function CardDetail({ cardId, onClose }: CardDetailProps) {
  const card = useCardById(cardId);
  const actions = useCardActions();
  const open = cardId !== null && card !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent aria-describedby={undefined}>
        {card ? <CardDetailBody card={card} actions={actions} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function CardDetailBody({
  card,
  actions,
  onClose,
}: {
  card: Card;
  actions: ReturnType<typeof useCardActions>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  useEffect(() => setTitle(card.title), [card.title]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const commitTitle = (): void => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== card.title) actions.rename(card.id, trimmed);
    else setTitle(card.title);
  };

  return (
    <>
      <SheetHeader>
        <span className="font-mono text-xs text-fg-faint">{card.shortId}</span>
        <SheetTitle asChild>
          <input
            aria-label="Card title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitTitle();
              }
            }}
            className="w-full bg-transparent pr-8 text-lg font-semibold tracking-[-0.01em] text-fg outline-none"
          />
        </SheetTitle>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Description</h3>
          <MarkdownEditor
            value={card.description}
            onChange={(v) => actions.setDescription(card.id, v)}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Properties</h3>
          <PropertyList card={card} actions={actions} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Links</h3>
          <CardLinks card={card} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Checklist</h3>
          <Checklist card={card} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Related</h3>
          <CardRelated card={card} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Labels</h3>
          <CardLabels card={card} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Activity</h3>
          <CardActivity cardId={card.id} />
        </section>
      </div>

      <div className="flex items-center gap-1 border-t border-line-subtle p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            actions.archive(card.id);
            onClose();
          }}
          className="text-fg-muted"
        >
          <Archive className="size-3.5" />
          Archive
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="ml-auto text-[var(--danger)] hover:text-[var(--danger)]"
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete this card?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-fg-muted">
            This permanently deletes <span className="text-fg">{card.title}</span> and can&rsquo;t
            be undone. To keep it for later, archive it instead.
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
                onClose();
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

function PropertyList({
  card,
  actions,
}: {
  card: Card;
  actions: ReturnType<typeof useCardActions>;
}) {
  const projects = useProjects();
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-fg-faint">Status</span>
      <StatusSelect value={card.status} onChange={(s) => actions.setStatus(card.id, s)} />

      <span className="text-fg-faint">Priority</span>
      <PrioritySelect value={card.priority} onChange={(p) => actions.setPriority(card.id, p)} />

      <span className="text-fg-faint">Due</span>
      <DueDatePicker value={card.dueDate} onChange={(d) => actions.setDueDate(card.id, d)} />

      <span className="text-fg-faint">Project</span>
      <ProjectSelect
        value={card.projectId}
        projects={projects}
        onChange={(projectId) => actions.setProject(card.id, projectId)}
      />
    </div>
  );
}
