"use client";

import type { Card } from "@boardly/domain";
import { isSafeHttpUrl, shortLabelFor } from "@boardly/domain";
import { Button, Input } from "@boardly/ui";
import { Plus, X } from "lucide-react";
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
          {card.links.map((link) => {
            const label = link.title ?? shortLabelFor(link.url);
            return (
              <li
                key={link.id}
                className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-overlay"
              >
                <a
                  href={isSafeHttpUrl(link.url) ? link.url : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <ProviderIcon provider={link.provider} />
                  <span className="truncate">{label}</span>
                </a>
                <button
                  type="button"
                  aria-label={`Remove link ${label}`}
                  onClick={() => actions.remove(card.id, link.id)}
                  className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[opacity,color,background-color] duration-[var(--dur-fast)] hover:bg-overlay hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
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
