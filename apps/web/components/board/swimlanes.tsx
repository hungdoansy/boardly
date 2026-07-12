"use client";

import {
  type Filter,
  type FilterContext,
  type GroupByField,
  evaluateFilter,
  groupCards,
  groupLabel,
  STATUS_META,
  STATUS_ORDER,
} from "@boardly/domain";
import { type ReactNode, useMemo } from "react";

import { useAllCards, useBadgeConfig, useLabels } from "../../lib/use-board";
import { CardFace } from "../card/card";

/**
 * Grouped board view (Unit 4.2). Rows are lanes (one per group value, an
 * "ungrouped" lane last); the columns within each lane are the fixed status
 * columns (STATUS_ORDER). Each cell holds the lane's cards that live in that
 * status, in board order. This is a read / triage view — cross-lane drag
 * reordering is a known follow-up — but cards remain openable and archivable.
 */
export function Swimlanes({
  groupBy,
  filter,
  filterCtx,
  onOpenCard,
}: {
  groupBy: GroupByField;
  filter?: Filter;
  filterCtx?: FilterContext;
  onOpenCard: (cardId: string) => void;
}) {
  const allCards = useAllCards();
  const labels = useLabels();
  const config = useBadgeConfig();
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);

  const lanes = useMemo(() => {
    const cards = filter
      ? allCards.filter((c) => evaluateFilter(c, filter, filterCtx ?? { now: Date.now() }))
      : allCards;
    return groupCards(cards, groupBy);
  }, [allCards, filter, filterCtx, groupBy]);

  return (
    <div className="h-full overflow-auto p-4" data-swimlanes>
      <div className="flex min-w-max flex-col gap-5">
        {lanes.length === 0 ? (
          <p className="text-sm text-fg-muted">No cards match this view.</p>
        ) : (
          lanes.map((lane) => (
            <Lane
              key={lane.key || "__ungrouped__"}
              title={groupLabel(groupBy, lane.key, {
                labelName: labelById.get(lane.key)?.name,
              })}
              count={lane.cards.length}
              muted={lane.key === ""}
            >
              {STATUS_ORDER.map((status) => {
                const cards = lane.cards.filter((c) => c.status === status);
                return (
                  <LaneColumn key={status} title={STATUS_META[status].name} count={cards.length}>
                    {cards.map((card) => (
                      <CardFace
                        key={card.id}
                        card={card}
                        labels={card.labelIds
                          .map((id) => labelById.get(id))
                          .filter((l) => l !== undefined)}
                        config={config}
                        onOpen={() => onOpenCard(card.id)}
                      />
                    ))}
                  </LaneColumn>
                );
              })}
            </Lane>
          ))
        )}
      </div>
    </div>
  );
}

function Lane({
  title,
  count,
  muted,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={`Lane: ${title}`} className="flex flex-col gap-2">
      <header className="sticky left-0 flex items-center gap-2">
        <h3 className={`text-md font-semibold ${muted ? "text-fg-faint" : "text-fg"}`}>{title}</h3>
        <span className="rounded-full bg-surface px-1.5 text-xs tabular-nums text-fg-faint">
          {count}
        </span>
      </header>
      <div className="flex items-start gap-3">{children}</div>
    </section>
  );
}

function LaneColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={`Column: ${title}`}
      className="flex w-[300px] shrink-0 flex-col rounded-[var(--radius-md)] border border-line-subtle bg-surface"
    >
      <header className="flex h-8 shrink-0 items-center gap-1 px-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-muted">{title}</span>
        <span className="px-1 text-xs tabular-nums text-fg-faint">{count}</span>
      </header>
      <div className="flex min-h-8 flex-col gap-1.5 px-2 pb-2">{children}</div>
    </div>
  );
}
