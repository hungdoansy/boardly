"use client";

import type { Label } from "@boardly/domain";
import { LABEL_COLORS } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@boardly/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { type LabelActions, useLabelActions, useLabels } from "../../lib/use-board";

/**
 * Board-level label admin (rename/recolor/delete existing labels; create new
 * ones). Each row previously repeated the full 10-color palette inline next
 * to every label, so N labels meant N duplicate rows of dots — cluttered and
 * unclear which swatches belonged to which action. Recoloring is now a
 * click-to-open picker on the label's own dot, and "create new" gets its own
 * labeled section with the only always-visible palette.
 */
export function LabelManager() {
  const labels = useLabels();
  const actions = useLabelActions();
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
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
        {labels.length === 0 ? "No labels yet" : labels.length === 1 ? "1 label" : `${labels.length} labels`}
      </p>
      <ul className="flex flex-col gap-0.5">
        {labels.map((label) => (
          <LabelRow key={label.id} label={label} actions={actions} />
        ))}
      </ul>

      <div className="flex flex-col gap-1.5 border-t border-line-subtle pt-2">
        <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
          New label
        </p>
        <div className="px-1">
          <ColorSwatches value={color} onChange={setColor} />
        </div>
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
            disabled={!name.trim()}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-primary text-primary-foreground hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-40"
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
    <li className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Change color for ${label.name}`}
            title="Change color"
            className="size-2.5 shrink-0 rounded-full ring-offset-2 ring-offset-[var(--bg-popover)] transition-shadow hover:ring-2 hover:ring-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            style={{ backgroundColor: label.color }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" side="right" align="start" sideOffset={8}>
          <ColorSwatches value={label.color} onChange={(c) => actions.recolor(label.id, c)} />
        </PopoverContent>
      </Popover>
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
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-label={`Color ${c.name}`}
          onClick={() => onChange(c.value)}
          className={cn(
            "size-4 rounded-full ring-offset-2 ring-offset-[var(--bg-popover)]",
            value === c.value ? "ring-2 ring-[var(--accent)]" : "",
          )}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  );
}
