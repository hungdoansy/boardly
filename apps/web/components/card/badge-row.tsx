import type { Card, Label } from "@boardly/domain";
import { Priority } from "@boardly/domain";
import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";

import { DueChip } from "./due-date";
import { LabelChip } from "./labels";
import { PriorityBadge } from "./priority-badge";
import { SeverityBadge } from "./severity-badge";

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
  const nodes: ReactNode[] = [];
  for (const key of config) {
    if (key === "priority" && card.priority !== Priority.None) {
      nodes.push(<PriorityBadge key="priority" priority={card.priority} />);
    } else if (key === "severity" && card.severity !== null) {
      nodes.push(<SeverityBadge key="severity" severity={card.severity} />);
    } else if (key === "dueDate" && card.dueDate) {
      nodes.push(<DueChip key="dueDate" due={card.dueDate} />);
    } else if (key === "labels" && labels.length > 0) {
      for (const label of labels) nodes.push(<LabelChip key={`label-${label.id}`} label={label} />);
    } else if (key === "checklist" && card.checklist.length > 0) {
      nodes.push(
        <span
          key="checklist"
          className="inline-flex items-center gap-0.5 text-[11px] text-fg-faint"
        >
          <ListChecks className="size-3" />
          {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
        </span>,
      );
    }
  }
  return <>{nodes}</>;
}
