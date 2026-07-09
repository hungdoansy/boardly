"use client";

import type { SeverityValue } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Check } from "lucide-react";
import { useState } from "react";

import { SeverityBadge } from "./severity-badge";

const OPTIONS: (SeverityValue | null)[] = [1, 2, 3, 4, null];

export function SeveritySelect({
  value,
  onChange,
}: {
  value: SeverityValue | null;
  onChange: (value: SeverityValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Severity"
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-fg transition-colors hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {value ? <SeverityBadge severity={value} /> : <span className="text-fg-faint">None</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40">
        {OPTIONS.map((s) => (
          <button
            key={s ?? "none"}
            type="button"
            role="menuitemradio"
            aria-checked={s === value}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="flex-1 text-left">
              {s ? <SeverityBadge severity={s} /> : <span className="text-fg-faint">None</span>}
            </span>
            {s === value ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
