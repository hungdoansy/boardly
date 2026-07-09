"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

interface CardComposerProps {
  onAdd: (title: string) => void;
}

export function CardComposer({ onAdd }: CardComposerProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = (): void => {
    const title = draft.trim();
    if (title) {
      onAdd(title);
      setDraft(""); // keep the composer open for rapid entry
    }
  };

  const close = (): void => {
    setDraft("");
    setAdding(false);
  };

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <Plus className="size-3.5" />
        Add card
      </button>
    );
  }

  return (
    <input
      autoFocus
      aria-label="New card title"
      placeholder="Card title…"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
        if (e.key === "Escape") close();
      }}
      onBlur={close}
      className="rounded-[var(--radius-md)] border border-line bg-elevated px-2.5 py-2 text-base text-fg outline-none ring-1 ring-[var(--accent)] placeholder:text-fg-faint"
    />
  );
}
