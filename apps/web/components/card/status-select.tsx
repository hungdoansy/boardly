"use client";

import { type Status, STATUS_META, STATUS_ORDER } from "@boardly/domain";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusIcon,
  type StatusVariant,
} from "@boardly/ui";
import { Check } from "lucide-react";
import { useState } from "react";

export function StatusSelect({
  value,
  onChange,
}: {
  value: Status;
  onChange: (value: Status) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[value];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Status"
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-fg transition-colors hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <StatusIcon variant={value as StatusVariant} color={meta.color} />
          {meta.name}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48">
        {STATUS_ORDER.map((s) => {
          const m = STATUS_META[s];
          return (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === value}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <StatusIcon variant={s as StatusVariant} color={m.color} />
              <span className="flex-1 text-left text-fg">{m.name}</span>
              {s === value ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
