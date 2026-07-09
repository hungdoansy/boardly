"use client";

import type { Card } from "@boardly/domain";
import { Archive } from "lucide-react";
import { useEffect, useState } from "react";

interface CardFaceProps {
  card: Card;
  onRename: (title: string) => void;
  onArchive: () => void;
}

export function CardFace({ card, onRename, onArchive }: CardFaceProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);

  useEffect(() => {
    if (editing) setDraft(card.title);
  }, [editing, card.title]);

  const commit = (): void => {
    onRename(draft.trim() || card.title);
    setEditing(false);
  };

  return (
    <article
      aria-label={`Card: ${card.title}`}
      className="group rounded-[var(--radius-md)] border border-line-subtle bg-elevated px-2.5 py-2 transition-colors duration-[var(--dur-fast)] hover:border-line hover:bg-overlay"
    >
      <div className="flex items-start gap-1">
        {editing ? (
          <input
            autoFocus
            aria-label="Card title"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-[var(--radius-sm)] bg-surface px-1 py-0.5 text-base text-fg outline-none ring-1 ring-[var(--accent)]"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 text-left text-base leading-snug text-fg focus-visible:outline-none"
          >
            <span className="line-clamp-2">{card.title}</span>
          </button>
        )}
        <button
          type="button"
          aria-label={`Archive ${card.title}`}
          onClick={onArchive}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <Archive className="size-3.5" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-xs text-fg-faint">{card.shortId}</span>
      </div>
    </article>
  );
}
