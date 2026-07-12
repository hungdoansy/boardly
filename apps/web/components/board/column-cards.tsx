"use client";

import { type Filter, type FilterContext, type Status, evaluateFilter } from "@boardly/domain";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";

import { useFocusMode } from "../../lib/focus-mode";
import { useBadgeConfig, useCardActions, useCardsInStatus, useLabels } from "../../lib/use-board";
import { CardComposer } from "../card/card-composer";
import { SortableCard } from "./dnd";

/** Zen collapses the card face to a single (muted) status marker + title. */
const ZEN_CONFIG = ["status"];

export function ColumnCards({
  status,
  onOpenCard,
  filter,
  filterCtx,
}: {
  status: Status;
  onOpenCard: (cardId: string) => void;
  filter?: Filter;
  filterCtx?: FilterContext;
}) {
  const allCards = useCardsInStatus(status);
  const labels = useLabels();
  const config = useBadgeConfig();
  const { level } = useFocusMode();
  const effectiveConfig = level === "zen" ? ZEN_CONFIG : config;
  const actions = useCardActions();
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
            status={status}
            labels={card.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
            config={effectiveConfig}
            onOpen={() => onOpenCard(card.id)}
            onArchive={() => actions.archive(card.id)}
          />
        ))}
      </SortableContext>
      <CardComposer
        onAdd={(title) => actions.create(title, status)}
        onCreateDetailed={(title) => onOpenCard(actions.create(title, status))}
      />
    </>
  );
}
