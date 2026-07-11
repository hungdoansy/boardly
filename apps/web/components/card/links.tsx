"use client";

import type { Card } from "@boardly/domain";
import { isSafeHttpUrl, shortLabelFor } from "@boardly/domain";
import { Button, Input } from "@boardly/ui";
import { ArrowUpRight, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useState } from "react";

import { useLinkActions } from "../../lib/use-board";
import { ProviderIcon } from "./provider-icon";

export function CardLinks({ boardId, card }: { boardId: string; card: Card }) {
  const actions = useLinkActions(boardId);
  const [url, setUrl] = useState("");

  const add = (): void => {
    const trimmed = url.trim();
    if (!trimmed) return;
    void actions.add(card.id, trimmed);
    setUrl("");
  };

  return (
    <div className="flex flex-col gap-2">
      {card.links.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {card.links.map((link, index) => {
            const raw = link.title ?? shortLabelFor(link.url);
            // Provider short-labels flag a deep link (Slack thread, Claude
            // session) with a trailing arrow marker — render it as an SVG, not
            // a glyph.
            const deepLink = raw.endsWith(" →");
            const label = deepLink ? raw.slice(0, -2) : raw;
            // Reorder by moving between the neighbors one slot further out (same
            // fractional-ord pattern as the checklist).
            const moveUp = (): void =>
              actions.move(card.id, link.id, {
                afterId: card.links[index - 2]?.id ?? null,
                beforeId: card.links[index - 1]?.id ?? null,
              });
            const moveDown = (): void =>
              actions.move(card.id, link.id, {
                afterId: card.links[index + 1]?.id ?? null,
                beforeId: card.links[index + 2]?.id ?? null,
              });
            return (
              <li
                key={link.id}
                className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover"
              >
                <a
                  href={isSafeHttpUrl(link.url) ? link.url : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <ProviderIcon provider={link.provider} />
                  <span className="truncate">{label}</span>
                  {deepLink ? (
                    <ArrowUpRight className="size-3 shrink-0 text-fg-faint" aria-hidden />
                  ) : null}
                </a>
                <div className="flex items-center opacity-0 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Move ${label} up`}
                    disabled={index === 0}
                    onClick={moveUp}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${label} down`}
                    disabled={index === card.links.length - 1}
                    onClick={moveDown}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove link ${label}`}
                    onClick={() => actions.remove(card.id, link.id)}
                    className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-[color,background-color] duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex gap-1">
        <Input
          aria-label="New link URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Paste a URL…"
        />
        <Button
          type="button"
          size="iconSm"
          aria-label="Add link"
          onClick={add}
          disabled={!url.trim()}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
