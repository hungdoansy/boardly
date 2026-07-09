"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { useCardActions, useCardsInColumn } from "../../lib/use-board";
import { CardComposer } from "../card/card-composer";
import { SortableCard } from "./dnd";

export function ColumnCards({ boardId, columnId }: { boardId: string; columnId: string }) {
  const cards = useCardsInColumn(boardId, columnId);
  const actions = useCardActions(boardId);

  return (
    <>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            card={card}
            columnId={columnId}
            onRename={(title) => actions.rename(card.id, title)}
            onArchive={() => actions.archive(card.id)}
          />
        ))}
      </SortableContext>
      <CardComposer onAdd={(title) => actions.create(columnId, title)} />
    </>
  );
}
