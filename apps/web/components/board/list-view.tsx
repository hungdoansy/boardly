"use client";

import {
  type Card,
  type Filter,
  type FilterContext,
  type GroupByField,
  type Label,
  type ResolvedView,
  type Sort,
  groupLabel,
  isTerminalStatus,
  resolveView,
  STATUS_META,
} from "@boardly/domain";
import { StatusIcon } from "@boardly/ui";
import { useCallback, useMemo, useRef } from "react";

import { useAuthSession } from "../../lib/auth-store";
import { useBadgeConfig, useAllCards, useLabels } from "../../lib/use-board";
import { useSelectedCard } from "../../lib/use-boards";
import { BadgeRow } from "../card/badge-row";
import { CardDetail } from "../card/card-detail";

/**
 * The list lens over the same cards the board shows. Both consume the shared
 * `resolveView` pipeline (Unit V1.1), so filter/sort/group stay identical
 * across lenses. Dense, keyboard-navigable rows; grouped sections when a
 * `groupBy` is set (Unit V1.3, R15/R16/R17).
 */
export function ListView({
  boardId,
  filter,
  groupBy,
  sort,
}: {
  boardId: string;
  filter?: Filter;
  groupBy?: GroupByField | null;
  sort?: Sort | null;
}) {
  const cards = useAllCards(boardId);
  const labels = useLabels(boardId);
  const config = useBadgeConfig(boardId);
  const [openCardId, setOpenCardId] = useSelectedCard();
  const { userId } = useAuthSession();

  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const filterCtx: FilterContext = useMemo(
    () => ({ now: Date.now(), currentUserId: userId ?? undefined }),
    [userId],
  );
  const resolved = useMemo(
    () => resolveView(cards, { filter, sort, groupBy }, filterCtx),
    [cards, filter, sort, groupBy, filterCtx],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const closeCard = useCallback(() => {
    const restore = openCardId;
    setOpenCardId(null);
    if (restore && rootRef.current) {
      const root = rootRef.current;
      requestAnimationFrame(() => {
        root
          .querySelector<HTMLElement>(`[data-nav="row"][data-card-id="${CSS.escape(restore)}"]`)
          ?.focus();
      });
    }
  }, [openCardId, setOpenCardId]);

  return (
    <>
      <div ref={rootRef} className="h-full overflow-y-auto">
        <ListBody
          resolved={resolved}
          labelById={labelById}
          config={config}
          groupBy={groupBy ?? null}
          onOpen={setOpenCardId}
        />
      </div>
      <CardDetail boardId={boardId} cardId={openCardId} onClose={closeCard} />
    </>
  );
}

/** Presentational body — pure over a resolved view, so it unit-tests directly. */
export function ListBody({
  resolved,
  labelById,
  config,
  groupBy,
  onOpen,
}: {
  resolved: ResolvedView;
  labelById: Map<string, Label>;
  config: string[];
  groupBy: GroupByField | null;
  onOpen: (cardId: string) => void;
}) {
  // The row shows a dedicated status glyph, so drop "status" from the badge row.
  const rowConfig = useMemo(() => config.filter((k) => k !== "status"), [config]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== " ") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-nav="row"]'));
    if (rows.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? rows.indexOf(active) : -1;
    if (e.key === "Enter" || e.key === " ") {
      if (idx >= 0) {
        e.preventDefault();
        onOpen(rows[idx]!.getAttribute("data-card-id")!);
      }
      return;
    }
    e.preventDefault();
    const next =
      e.key === "ArrowDown" ? rows[Math.min(idx + 1, rows.length - 1)] : rows[Math.max(idx - 1, 0)];
    next?.focus();
  };

  const isEmpty = "flat" in resolved ? resolved.flat.length === 0 : resolved.grouped.length === 0;
  if (isEmpty) {
    return (
      <div className="grid h-full place-items-center p-6">
        <p className="text-base text-fg-muted">No cards match.</p>
      </div>
    );
  }

  return (
    <div role="list" className="flex flex-col" onKeyDown={onKeyDown}>
      {"grouped" in resolved
        ? resolved.grouped.map((group) => (
            <section
              key={group.key || "__ungrouped"}
              aria-label={`Group: ${sectionLabel(groupBy, group.key, labelById)}`}
            >
              <header className="sticky top-0 z-[1] flex items-center gap-2 bg-canvas/95 px-4 py-1.5 backdrop-blur-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                  {sectionLabel(groupBy, group.key, labelById)}
                </span>
                <span className="text-xs tabular-nums text-fg-faint">{group.cards.length}</span>
              </header>
              {group.cards.map((card) => (
                <ListRow
                  key={card.id}
                  card={card}
                  labelById={labelById}
                  config={rowConfig}
                  onOpen={onOpen}
                />
              ))}
            </section>
          ))
        : resolved.flat.map((card) => (
            <ListRow
              key={card.id}
              card={card}
              labelById={labelById}
              config={rowConfig}
              onOpen={onOpen}
            />
          ))}
    </div>
  );
}

function sectionLabel(
  groupBy: GroupByField | null,
  key: string,
  labelById: Map<string, Label>,
): string {
  if (!groupBy) return "";
  return groupLabel(groupBy, key, { labelName: labelById.get(key)?.name });
}

function ListRow({
  card,
  labelById,
  config,
  onOpen,
}: {
  card: Card;
  labelById: Map<string, Label>;
  config: string[];
  onOpen: (cardId: string) => void;
}) {
  const terminal = isTerminalStatus(card.status);
  const cardLabels = card.labelIds.map((id) => labelById.get(id)).filter((l): l is Label => !!l);
  return (
    <div
      role="button"
      aria-label={card.title}
      tabIndex={0}
      data-nav="row"
      data-card-id={card.id}
      onClick={() => onOpen(card.id)}
      // Cheap windowing: the browser skips layout/paint for offscreen rows,
      // keeping hundreds of rows smooth without a virtualization dependency.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 37px" }}
      className="group flex h-[37px] cursor-pointer items-center gap-2 border-b border-line-subtle px-4 text-sm outline-none transition-colors hover:bg-hover focus-visible:bg-overlay focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
    >
      <StatusIcon
        variant={card.status}
        color={STATUS_META[card.status].color}
        className="shrink-0"
      />
      <span className="shrink-0 font-mono text-xs text-fg-faint">{card.shortId}</span>
      <span className={terminal ? "truncate text-fg-faint line-through" : "truncate text-fg"}>
        {card.title}
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <BadgeRow card={card} labels={cardLabels} config={config} />
        {card.assigneeId ? (
          <span
            className="grid size-5 shrink-0 place-items-center rounded-full bg-overlay text-[10px] text-fg-muted"
            title={card.assigneeId}
          >
            {card.assigneeId.slice(0, 2).toUpperCase()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
