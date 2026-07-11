"use client";

import { type Filter, type FilterContext, evaluateFilter } from "@boardly/domain";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";

import { useBadgeConfig, useCardActions, useCardsInColumn, useLabels } from "../../lib/use-board";
import { CardComposer } from "../card/card-composer";
import { SortableCard } from "./dnd";

export function ColumnCards({
  boardId,
  columnId,
  onOpenCard,
  filter,
  filterCtx,
}: {
  boardId: string;
  columnId: string;
  onOpenCard: (cardId: string) => void;
  filter?: Filter;
  filterCtx?: FilterContext;
}) {
  const allCards = useCardsInColumn(boardId, columnId);
  const labels = useLabels(boardId);
  const config = useBadgeConfig(boardId);
  const actions = useCardActions(boardId);
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const cards = useMemo(
    () =>
      filter
        ? allCards.filter((c) => evaluateFilter(c, filter, filterCtx ?? { now: Date.now() }))
        : allCards,
    [allCards, filter, filterCtx],
  );

  return (
    <>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            card={card}
            columnId={columnId}
            labels={card.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
            config={config}
            onOpen={() => onOpenCard(card.id)}
            onArchive={() => actions.archive(card.id)}
          />
        ))}
      </SortableContext>
      <CardComposer
        onAdd={(title) => actions.create(columnId, title)}
        onCreateDetailed={() => onOpenCard(actions.create(columnId, "New card"))}
      />
    </>
  );
}
