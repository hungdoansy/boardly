"use client";

import type { Card, Label } from "@boardly/domain";
import { LABEL_COLORS } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@boardly/ui";
import { Check, Plus, Tag } from "lucide-react";
import { useState } from "react";

import { useLabelActions, useLabels } from "../../lib/use-board";

/** A colored label chip (low-alpha fill + full-color dot/text). */
export function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className="inline-flex h-[18px] items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-[11px] font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${label.color} 16%, transparent)`,
        color: label.color,
      }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
    </span>
  );
}

/** Card's assigned label chips + a popover to assign/create labels. */
export function CardLabels({ boardId, card }: { boardId: string; card: Card }) {
  const labels = useLabels(boardId);
  const actions = useLabelActions(boardId);
  const assignedIds = new Set(card.labelIds);
  const assigned = labels.filter((l) => assignedIds.has(l.id));

  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[1]!.value);

  const createAndAssign = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = actions.create(trimmed, color);
    if (id) actions.assign(card.id, id);
    setName("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((l) => (
        <LabelChip key={l.id} label={l} />
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-[18px] items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-line px-1.5 text-[11px] text-fg-faint transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Tag className="size-3" />
            {assigned.length === 0 ? "Add label" : "Edit"}
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <div className="flex flex-col gap-0.5">
            {labels.map((l) => {
              const on = assignedIds.has(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() =>
                    on ? actions.unassign(card.id, l.id) : actions.assign(card.id, l.id)
                  }
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 text-left text-fg">{l.name}</span>
                  {on ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
                </button>
              );
            })}
            {labels.length === 0 ? (
              <p className="px-2 py-1 text-xs text-fg-faint">No labels yet.</p>
            ) : null}
          </div>

          <div className="mt-1 flex flex-col gap-2 border-t border-line-subtle pt-2">
            <div className="flex flex-wrap gap-1 px-1">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  aria-label={`Color ${c.name}`}
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "size-4 rounded-full ring-offset-2 ring-offset-[var(--bg-popover)]",
                    color === c.value ? "ring-2 ring-[var(--accent)]" : "",
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex gap-1 px-1">
              <input
                aria-label="New label name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createAndAssign();
                }}
                placeholder="New label…"
                className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-elevated px-2 text-sm text-fg outline-none ring-1 ring-line focus-visible:ring-[var(--accent)] placeholder:text-fg-faint"
              />
              <button
                type="button"
                aria-label="Create label"
                onClick={createAndAssign}
                className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground hover:bg-[var(--accent-hover)]"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
