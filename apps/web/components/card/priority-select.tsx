"use client";

import { type PriorityValue, PRIORITY_META, Priority } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Check } from "lucide-react";
import { useState } from "react";

import { PriorityIcon } from "./priority-badge";

const ORDER: PriorityValue[] = [
  Priority.Urgent,
  Priority.High,
  Priority.Medium,
  Priority.Low,
  Priority.None,
];

export function PrioritySelect({
  value,
  onChange,
}: {
  value: PriorityValue;
  onChange: (value: PriorityValue) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Priority"
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-fg transition-colors hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <PriorityIcon level={value} />
          {PRIORITY_META[value].name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44">
        {ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="menuitemradio"
            aria-checked={p === value}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <PriorityIcon level={p} />
            <span className="flex-1 text-left text-fg">{PRIORITY_META[p].name}</span>
            {p === value ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
