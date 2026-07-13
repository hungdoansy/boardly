"use client";

import type { Card } from "@boardly/domain";
import { Popover, PopoverContent, PopoverTrigger } from "@boardly/ui";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useAllCards, useCardActions } from "../../lib/use-board";
import { useSelectedCard } from "../../lib/use-boards";
import { StatusBadge } from "./status-badge";

/**
 * The card drawer's Related section: the card's related tickets as a list of
 * rows (each opens that card), plus a popover that searches the board by ticket
 * id / title to add a new relation. Relations are untyped and symmetric
 * (Unit 9.1) — adding one here surfaces it on the other card too. `useAllCards`
 * already excludes archived cards, so they never appear as related or in the
 * picker.
 */
export function CardRelated({ card }: { card: Card }) {
  const allCards = useAllCards();
  const actions = useCardActions();
  const [, openCard] = useSelectedCard();
  const [query, setQuery] = useState("");

  const relatedSet = useMemo(() => new Set(card.relatedIds), [card.relatedIds]);
  const byId = useMemo(() => new Map(allCards.map((c) => [c.id, c])), [allCards]);
  const related = card.relatedIds
    .map((id) => byId.get(id))
    .filter((c): c is Card => c !== undefined);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [] as Card[];
    return allCards
      .filter(
        (c) =>
          c.id !== card.id &&
          !relatedSet.has(c.id) &&
          (c.title.toLowerCase().includes(q) || c.shortId.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [allCards, card.id, relatedSet, q]);

  return (
    <div className="flex flex-col gap-2">
      {related.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {related.map((c) => (
            <li
              key={c.id}
              className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover"
            >
              <button
                type="button"
                onClick={() => openCard(c.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <span className="shrink-0">
                  <StatusBadge status={c.status} />
                </span>
                <span className="shrink-0 font-mono text-xs text-fg-faint">{c.shortId}</span>
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove relation to ${c.shortId}`}
                onClick={() => actions.removeRelated(card.id, c.id)}
                className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-[color,background-color,opacity] duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Popover onOpenChange={(open) => !open && setQuery("")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-[18px] w-fit items-center gap-1 rounded-[var(--radius-sm)] border border-dashed border-line px-1.5 text-[11px] text-fg-faint transition-colors hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Plus className="size-3" />
            Add related
          </button>
        </PopoverTrigger>
        <PopoverContent aria-label="Add related ticket" className="w-80">
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              aria-label="Search cards to relate"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by id or title…"
              className="h-7 w-full rounded-[var(--radius-sm)] bg-elevated px-2 text-sm text-fg outline-none ring-1 ring-line focus-visible:ring-[var(--accent)] placeholder:text-fg-faint"
            />
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    actions.addRelated(card.id, c.id);
                    setQuery("");
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <span className="shrink-0">
                    <StatusBadge status={c.status} />
                  </span>
                  <span className="shrink-0 font-mono text-xs text-fg-faint">{c.shortId}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">{c.title}</span>
                </button>
              ))}
              {q && matches.length === 0 ? (
                <p className="px-2 py-1 text-xs text-fg-faint">No matching cards.</p>
              ) : null}
              {!q ? (
                <p className="px-2 py-1 text-xs text-fg-faint">Type to search cards.</p>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
