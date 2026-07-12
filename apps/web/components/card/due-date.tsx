"use client";

import type { DueDate } from "@boardly/domain";
import { describeDueDate } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { CalendarDays, X } from "lucide-react";
import { useState } from "react";

import { CHIP } from "./chip";

// Overdue/soon carry urgency on the icon + text color; a normal due date stays
// neutral. The shared bordered shell replaces the old tinted fills.
const TONE = {
  overdue: "var(--danger)",
  soon: "var(--warning)",
  normal: "var(--text-secondary)",
} as const;

export function DueChip({ due, now = Date.now() }: { due: DueDate; now?: number }) {
  const { label, tone } = describeDueDate(due, now);
  return (
    <span className={CHIP} style={{ color: TONE[tone] }} title={`Due ${label}`}>
      <CalendarDays className="size-3 shrink-0" />
      {label}
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toDateValue = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toTimeValue = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DueDatePicker({
  value,
  onChange,
}: {
  value: DueDate | null;
  onChange: (due: DueDate | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const dateValue = value ? toDateValue(value.at) : "";
  const withTime = value?.hasTime ?? false;
  const timeValue = value?.hasTime ? toTimeValue(value.at) : "";

  const commit = (dateStr: string, timeStr: string, hasTime: boolean): void => {
    if (!dateStr) {
      onChange(null);
      return;
    }
    const at = new Date(`${dateStr}T${hasTime && timeStr ? timeStr : "00:00"}`).getTime();
    onChange({ at, hasTime });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Due date"
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {value ? <DueChip due={value} /> : <span className="text-fg-faint">Set due date</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <div className="flex flex-col gap-2">
          <input
            type="date"
            aria-label="Due date input"
            value={dateValue}
            onChange={(e) => commit(e.target.value, timeValue, withTime)}
            className="h-8 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-sm text-fg outline-none ring-1 ring-line [color-scheme:dark] focus-visible:ring-[var(--accent)]"
          />
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              aria-label="Include time"
              checked={withTime}
              onChange={(e) => commit(dateValue, timeValue, e.target.checked)}
            />
            Include time
          </label>
          {withTime ? (
            <input
              type="time"
              aria-label="Due time input"
              value={timeValue}
              onChange={(e) => commit(dateValue, e.target.value, true)}
              className="h-8 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-sm text-fg outline-none ring-1 ring-line [color-scheme:dark] focus-visible:ring-[var(--accent)]"
            />
          ) : null}
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-fg-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X className="size-3.5" />
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
