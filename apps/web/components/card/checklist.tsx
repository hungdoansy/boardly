"use client";

import type { Card, ChecklistItem } from "@boardly/domain";
import { Button, cn, Input } from "@boardly/ui";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { type ChecklistActions, useChecklistActions } from "../../lib/use-board";

export function Checklist({ boardId, card }: { boardId: string; card: Card }) {
  const items = card.checklist;
  const actions = useChecklistActions(boardId);
  const done = items.filter((i) => i.done).length;
  const [draft, setDraft] = useState("");

  const addItem = (): void => {
    const text = draft.trim();
    if (!text) return;
    actions.add(card.id, text);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-fg-faint">
            {done}/{items.length}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
            <div
              className="h-full rounded-full bg-[var(--success)] transition-[width] duration-[var(--dur-base)]"
              style={{ width: `${(done / items.length) * 100}%` }}
            />
          </div>
        </div>
      ) : null}

      <ul className="flex flex-col gap-0.5">
        {items.map((item, index) => (
          <ChecklistRow
            key={item.id}
            item={item}
            index={index}
            items={items}
            cardId={card.id}
            actions={actions}
          />
        ))}
      </ul>

      <div className="flex gap-1">
        <Input
          aria-label="New checklist item"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addItem();
          }}
          placeholder="Add an item…"
        />
        <Button
          type="button"
          size="iconSm"
          aria-label="Add checklist item"
          onClick={addItem}
          disabled={!draft.trim()}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function ChecklistRow({
  item,
  index,
  items,
  cardId,
  actions,
}: {
  item: ChecklistItem;
  index: number;
  items: ChecklistItem[];
  cardId: string;
  actions: ChecklistActions;
}) {
  const [text, setText] = useState(item.text);
  useEffect(() => setText(item.text), [item.text]);

  const commit = (): void => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== item.text) actions.setText(cardId, item.id, trimmed);
    else setText(item.text);
  };

  const moveUp = (): void =>
    actions.move(cardId, item.id, {
      afterId: items[index - 2]?.id ?? null,
      beforeId: items[index - 1]?.id ?? null,
    });
  const moveDown = (): void =>
    actions.move(cardId, item.id, {
      afterId: items[index + 1]?.id ?? null,
      beforeId: items[index + 2]?.id ?? null,
    });

  return (
    <li className="group flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-hover">
      <input
        type="checkbox"
        aria-label={`Toggle ${item.text}`}
        checked={item.done}
        onChange={() => actions.toggle(cardId, item.id)}
        className="size-3.5 accent-[var(--accent)]"
      />
      <input
        aria-label={`Edit ${item.text}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-sm outline-none",
          item.done ? "text-fg-faint line-through" : "text-fg",
        )}
      />
      <div className="flex items-center opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Move up"
          disabled={index === 0}
          onClick={moveUp}
          className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move down"
          disabled={index === items.length - 1}
          onClick={moveDown}
          className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete ${item.text}`}
          onClick={() => actions.remove(cardId, item.id)}
          className="grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint transition-colors duration-[var(--dur-fast)] hover:bg-hover hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  );
}
