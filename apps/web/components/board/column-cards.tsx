"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";

import { useCardActions, useCardsInColumn, useLabels } from "../../lib/use-board";
import { CardComposer } from "../card/card-composer";
import { SortableCard } from "./dnd";

export function ColumnCards({
  boardId,
  columnId,
  onOpenCard,
}: {
  boardId: string;
  columnId: string;
  onOpenCard: (cardId: string) => void;
}) {
  const cards = useCardsInColumn(boardId, columnId);
  const labels = useLabels(boardId);
  const actions = useCardActions(boardId);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  return (
    <>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            card={card}
            columnId={columnId}
            labels={card.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
            onOpen={() => onOpenCard(card.id)}
            onArchive={() => actions.archive(card.id)}
          />
        ))}
      </SortableContext>
      <CardComposer onAdd={(title) => actions.create(columnId, title)} />
    </>
  );
}
