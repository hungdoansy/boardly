"use client";

import { PanelRight, Plus } from "lucide-react";
import { useState } from "react";

interface CardComposerProps {
  onAdd: (title: string) => void;
  /** Create a card and open its detail drawer straight away (title + links in one go). */
  onCreateDetailed?: () => void;
}

export function CardComposer({ onAdd, onCreateDetailed }: CardComposerProps) {
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
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          data-nav-composer
          onClick={() => setAdding(true)}
          className="flex h-7 flex-1 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <Plus className="size-3.5" />
          Add card
        </button>
        {onCreateDetailed ? (
          <button
            type="button"
            aria-label="Add card with details"
            title="Add card with details"
            onClick={onCreateDetailed}
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <PanelRight className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <input
      autoFocus
      data-nav-composer
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
      className="w-full rounded-[var(--radius-md)] border border-[var(--accent)] bg-elevated px-2.5 py-2 text-base text-fg outline-none placeholder:text-fg-faint"
    />
  );
}
