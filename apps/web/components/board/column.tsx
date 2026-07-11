"use client";

import type { Column } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { GripVertical, Trash2 } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

interface DragHandle {
  ref: (el: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

interface BoardColumnProps {
  column: Column;
  count: number;
  onRename: (title: string) => void;
  onSetWipLimit: (wipLimit: number | null) => void;
  onDelete: () => void;
  children?: ReactNode;
  dndRef?: (el: HTMLElement | null) => void;
  dndStyle?: CSSProperties;
  dragHandle?: DragHandle;
}

export function BoardColumn({
  column,
  count,
  onRename,
  onSetWipLimit,
  onDelete,
  children,
  dndRef,
  dndStyle,
  dragHandle,
}: BoardColumnProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.title);

  useEffect(() => {
    if (editing) setDraft(column.title);
  }, [editing, column.title]);

  const commit = (): void => {
    onRename(draft.trim() || column.title);
    setEditing(false);
  };

  return (
    <section
      ref={dndRef}
      style={dndStyle}
      data-nav-column={column.id}
      aria-label={`Column: ${column.title}`}
      className="flex max-h-full w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border border-line-subtle bg-surface"
    >
      <header className="group flex h-9 shrink-0 items-center gap-1 px-2">
        {dragHandle ? (
          <button
            type="button"
            ref={dragHandle.ref}
            aria-label={`Reorder ${column.title}`}
            className="grid size-5 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
            {...dragHandle.attributes}
            {...dragHandle.listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}
        {editing ? (
          <input
            autoFocus
            aria-label="Column name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-6 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-elevated px-1.5 text-md font-medium text-fg outline-none ring-1 ring-[var(--accent)]"
          />
        ) : (
          <button
            type="button"
            data-nav="column"
            data-column-id={column.id}
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] px-1 py-0.5 text-left text-md font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {column.title}
          </button>
        )}
        <WipBadge
          count={count}
          wipLimit={column.wipLimit}
          columnTitle={column.title}
          onSetWipLimit={onSetWipLimit}
        />
        <button
          type="button"
          aria-label={`Delete ${column.title}`}
          onClick={onDelete}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>

      <div className="flex min-h-9 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
        {children}
      </div>
    </section>
  );
}

/** Card count, or `count / limit` when a soft WIP limit is set. Click to edit. */
function WipBadge({
  count,
  wipLimit,
  columnTitle,
  onSetWipLimit,
}: {
  count: number;
  wipLimit?: number;
  columnTitle: string;
  onSetWipLimit: (wipLimit: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const over = wipLimit !== undefined && count >= wipLimit;

  const commit = (): void => {
    const n = Number.parseInt(draft, 10);
    onSetWipLimit(Number.isFinite(n) && n > 0 ? n : null);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(wipLimit ? String(wipLimit) : "");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`WIP limit for ${columnTitle}`}
          className={`rounded-[var(--radius-sm)] px-1 text-xs tabular-nums transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
            over ? "font-medium text-[var(--danger)]" : "text-fg-faint"
          }`}
        >
          {wipLimit !== undefined ? `${count}/${wipLimit}` : count}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-52 flex-col gap-2">
        <span className="text-xs text-fg-muted">WIP limit (soft — never blocks adding)</span>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="number"
            min={1}
            aria-label="WIP limit"
            placeholder="None"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setOpen(false);
            }}
            className="h-7 w-20 rounded-[var(--radius-sm)] border border-line bg-elevated px-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={commit}
            className="h-7 rounded-[var(--radius-sm)] bg-primary px-2 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Set
          </button>
          {wipLimit !== undefined ? (
            <button
              type="button"
              onClick={() => {
                onSetWipLimit(null);
                setOpen(false);
              }}
              className="h-7 rounded-[var(--radius-sm)] px-2 text-sm text-fg-muted hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
