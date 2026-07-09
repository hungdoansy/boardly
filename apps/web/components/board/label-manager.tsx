"use client";

import type { Label } from "@boardly/domain";
import { LABEL_COLORS } from "@boardly/domain";
import { cn } from "@boardly/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { type LabelActions, useLabelActions, useLabels } from "../../lib/use-board";

export function LabelManager({ boardId }: { boardId: string }) {
  const labels = useLabels(boardId);
  const actions = useLabelActions(boardId);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[1]!.value);

  const create = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    actions.create(trimmed, color);
    setName("");
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-0.5">
        {labels.map((label) => (
          <LabelRow key={label.id} label={label} actions={actions} />
        ))}
        {labels.length === 0 ? (
          <li className="px-1 py-2 text-xs text-fg-faint">No labels yet.</li>
        ) : null}
      </ul>

      <div className="flex flex-col gap-2 border-t border-line-subtle pt-2">
        <ColorSwatches value={color} onChange={setColor} />
        <div className="flex gap-1">
          <input
            aria-label="New label name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
            placeholder="New label…"
            className="h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] bg-elevated px-2 text-sm text-fg outline-none ring-1 ring-line focus-visible:ring-[var(--accent)] placeholder:text-fg-faint"
          />
          <button
            type="button"
            aria-label="Create label"
            onClick={create}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground hover:bg-[var(--accent-hover)]"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LabelRow({ label, actions }: { label: Label; actions: LabelActions }) {
  const [name, setName] = useState(label.name);
  useEffect(() => setName(label.name), [label.name]);

  const commit = (): void => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== label.name) actions.rename(label.id, trimmed);
    else setName(label.name);
  };

  return (
    <li className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-overlay">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <input
        aria-label={`Rename ${label.name}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none"
      />
      <ColorSwatches value={label.color} onChange={(c) => actions.recolor(label.id, c)} compact />
      <button
        type="button"
        aria-label={`Delete ${label.name}`}
        onClick={() => actions.remove(label.id)}
        className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

function ColorSwatches({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (color: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", compact && "max-w-28 justify-end")}>
      {LABEL_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-label={`Color ${c.name}`}
          onClick={() => onChange(c.value)}
          className={cn(
            "rounded-full ring-offset-2 ring-offset-[var(--bg-popover)]",
            compact ? "size-3" : "size-4",
            value === c.value ? "ring-2 ring-[var(--accent)]" : "",
          )}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  );
}
