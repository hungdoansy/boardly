"use client";

import type { Card } from "@boardly/domain";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@boardly/ui";
import { Archive } from "lucide-react";
import { useEffect, useState } from "react";

import { useCardActions, useCardById } from "../../lib/use-board";
import { CardLabels } from "./labels";
import { MarkdownEditor } from "./markdown-editor";
import { PrioritySelect } from "./priority-select";
import { SeveritySelect } from "./severity-select";

interface CardDetailProps {
  boardId: string;
  cardId: string | null;
  onClose: () => void;
}

export function CardDetail({ boardId, cardId, onClose }: CardDetailProps) {
  const card = useCardById(boardId, cardId);
  const actions = useCardActions(boardId);
  const open = cardId !== null && card !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent aria-describedby={undefined}>
        {card ? (
          <CardDetailBody boardId={boardId} card={card} actions={actions} onClose={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function CardDetailBody({
  boardId,
  card,
  actions,
  onClose,
}: {
  boardId: string;
  card: Card;
  actions: ReturnType<typeof useCardActions>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  useEffect(() => setTitle(card.title), [card.title]);

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
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Labels</h3>
          <CardLabels boardId={boardId} card={card} />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-faint">Properties</h3>
          <PropertyList card={card} actions={actions} />
          <p className="text-xs text-fg-faint">
            Status &amp; due-date controls arrive in Units 2.4 / 2.12.
          </p>
        </section>
      </div>

      <div className="border-t border-line-subtle p-3">
        <button
          type="button"
          onClick={() => {
            actions.archive(card.id);
            onClose();
          }}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-[var(--danger)] transition-colors hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Archive className="size-3.5" />
          Archive card
        </button>
      </div>
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
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-x-4 gap-y-1 text-sm">
      <span className="text-fg-faint">Status</span>
      <span className="capitalize text-fg">{card.status.replace(/_/g, " ")}</span>

      <span className="text-fg-faint">Priority</span>
      <PrioritySelect value={card.priority} onChange={(p) => actions.setPriority(card.id, p)} />

      <span className="text-fg-faint">Severity</span>
      <SeveritySelect value={card.severity} onChange={(s) => actions.setSeverity(card.id, s)} />

      <span className="text-fg-faint">Due</span>
      <span className="text-fg">
        {card.dueDate ? new Date(card.dueDate.at).toLocaleDateString() : "—"}
      </span>
    </div>
  );
}
