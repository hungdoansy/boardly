"use client";

import {
  type Filter,
  type FilterContext,
  type Status,
  deriveCardDefaults,
  evaluateFilter,
} from "@boardly/domain";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMemo } from "react";

import { useFocusMode } from "../../lib/focus-mode";
import { useBadgeConfig, useCardActions, useCardsInStatus, useLabels } from "../../lib/use-board";
import { useProjects } from "../../lib/use-projects";
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
  const projects = useProjects();
  const config = useBadgeConfig();
  const { level } = useFocusMode();
  const zen = level === "zen";
  const effectiveConfig = zen ? ZEN_CONFIG : config;
  const actions = useCardActions();
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const cards = useMemo(
    () =>
      filter
        ? allCards.filter((c) => evaluateFilter(c, filter, filterCtx ?? { now: Date.now() }))
        : allCards,
    [allCards, filter, filterCtx],
  );

  // A card added while a filter is active inherits the filter's implied fields
  // (project/priority/labels) so it stays visible (Unit 9.5).
  const cardDefaults = useMemo(() => (filter ? deriveCardDefaults(filter) : undefined), [filter]);

  return (
    <>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            card={card}
            status={status}
            labels={card.labelIds.map((id) => labelById.get(id)).filter((l) => l !== undefined)}
            project={zen || !card.projectId ? undefined : projectById.get(card.projectId)}
            config={effectiveConfig}
            onOpen={() => onOpenCard(card.id)}
          />
        ))}
      </SortableContext>
      <CardComposer
        onAdd={(title) => actions.create(title, status, cardDefaults)}
        onCreateDetailed={(title) => onOpenCard(actions.create(title, status, cardDefaults))}
      />
    </>
  );
}
