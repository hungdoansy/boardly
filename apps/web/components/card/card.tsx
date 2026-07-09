"use client";

import type { Card, Label } from "@boardly/domain";
import { Archive } from "lucide-react";

import { LabelChip } from "./labels";

interface CardFaceProps {
  card: Card;
  labels?: Label[];
  onOpen: () => void;
  onArchive: () => void;
}

export function CardFace({ card, labels, onOpen, onArchive }: CardFaceProps) {
  return (
    <article
      aria-label={`Card: ${card.title}`}
      className="group rounded-[var(--radius-md)] border border-line-subtle bg-elevated px-2.5 py-2 transition-colors duration-[var(--dur-fast)] hover:border-line hover:bg-overlay"
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <span className="line-clamp-2 text-base leading-snug text-fg">{card.title}</span>
        </button>
        <button
          type="button"
          aria-label={`Archive ${card.title}`}
          onClick={onArchive}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <Archive className="size-3.5" />
        </button>
      </div>
      {labels && labels.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2">
        <span className="font-mono text-xs text-fg-faint">{card.shortId}</span>
      </div>
    </article>
  );
}
