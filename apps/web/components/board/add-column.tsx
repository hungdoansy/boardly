"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

interface AddColumnProps {
  onAdd: (title: string) => void;
}

export function AddColumn({ onAdd }: AddColumnProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = (): void => {
    const title = draft.trim();
    if (title) onAdd(title);
    setDraft("");
    setAdding(false);
  };

  const cancel = (): void => {
    setDraft("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex h-9 w-[300px] shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line px-2 text-md text-fg-muted transition-colors duration-[var(--dur-fast)] hover:border-line-strong hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Plus className="size-4" />
        Add column
      </button>
    );
  }

  return (
    <div className="w-[300px] shrink-0 rounded-[var(--radius-md)] border border-line bg-surface p-2">
      <input
        autoFocus
        aria-label="New column name"
        placeholder="Column name…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onBlur={cancel}
        className="h-7 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-base text-fg outline-none ring-1 ring-[var(--accent)] placeholder:text-fg-faint"
      />
    </div>
  );
}
