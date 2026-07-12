import type { Card, Label } from "@boardly/domain";
import { Priority } from "@boardly/domain";
import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { CHIP } from "./chip";
import { DueChip } from "./due-date";
import { LabelChip } from "./labels";
import { LinkCluster } from "./link-cluster";
import { PriorityBadge } from "./priority-badge";
import { StatusBadge } from "./status-badge";

/**
 * Builds the card's "highlighted" badge nodes in the per-board configured order,
 * emitting nothing for a configured field the card doesn't have. Returned as an
 * array so callers can partition it across card-face rows (and tell when a row
 * would be empty) — see {@link CardFace}.
 */
export function collectBadgeNodes(card: Card, labels: Label[], config: string[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (const key of config) {
    if (key === "status") {
      nodes.push(<StatusBadge key="status" status={card.status} />);
    } else if (key === "priority" && card.priority !== Priority.None) {
      nodes.push(<PriorityBadge key="priority" priority={card.priority} />);
    } else if (key === "dueDate" && card.dueDate) {
      nodes.push(<DueChip key="dueDate" due={card.dueDate} />);
    } else if (key === "labels" && labels.length > 0) {
      for (const label of labels) nodes.push(<LabelChip key={`label-${label.id}`} label={label} />);
    } else if (key === "links" && card.links.length > 0) {
      nodes.push(<LinkCluster key="links" links={card.links} />);
    } else if (key === "checklist" && card.checklist.length > 0) {
      nodes.push(
        <span key="checklist" className={`${CHIP} tabular-nums text-fg-muted`}>
          <ListChecks className="size-3 shrink-0" />
          {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
        </span>,
      );
    }
  }
  return nodes;
}

/**
 * Renders the card's "highlighted" badges in the per-board configured order,
 * emitting nothing for a configured field the card doesn't have.
 */
export function BadgeRow({
  card,
  labels,
  config,
}: {
  card: Card;
  labels: Label[];
  config: string[];
}) {
  return <>{collectBadgeNodes(card, labels, config)}</>;
}
