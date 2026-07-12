"use client";

import type { Project } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Box, Check } from "lucide-react";
import { useState } from "react";

export function ProjectSelect({
  value,
  projects,
  onChange,
}: {
  value: string | undefined;
  projects: Project[];
  onChange: (projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((p) => p.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Project"
          className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Box className="size-3.5" style={selected ? { color: selected.color } : undefined} />
          {selected ? selected.name : "No project"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={!selected}
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Box className="size-3.5" />
          <span className="flex-1 text-left text-fg">No project</span>
          {!selected ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            role="menuitemradio"
            aria-checked={p.id === value}
            onClick={() => {
              onChange(p.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Box className="size-3.5" style={{ color: p.color }} />
            <span className="flex-1 truncate text-left text-fg">{p.name}</span>
            {p.id === value ? <Check className="size-3.5 text-[var(--accent)]" /> : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
