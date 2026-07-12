"use client";

import type { Card, Label, Project } from "@boardly/domain";
import { isTerminalStatus } from "@boardly/domain";
import { Archive } from "lucide-react";

import { collectBadgeNodes } from "./badge-row";
import { ProjectChip } from "./project-chip";
import { StatusBadge } from "./status-badge";

interface CardFaceProps {
  card: Card;
  labels?: Label[];
  project?: Project;
  config?: string[];
  onOpen: () => void;
  onArchive: () => void;
}

// The card face reads top-to-bottom in three tiers so the eye lands in the same
// place on every card:
//   • title row  — status glyph leads the title (workflow state first)
//   • middle row — the "what is this" tags: project, severity, labels
//   • bottom row — the metadata line: priority at the far left, then links;
//     due date, checklist, and the ticket id are pushed to the right.
// Status/priority/links/due/checklist are placed by hand; the remaining keys
// (severity, labels) keep the per-board configured order.
const MIDDLE_KEYS = new Set(["severity", "labels"]);
const BOTTOM_LEFT_KEYS = new Set(["priority", "links"]);
const BOTTOM_RIGHT_KEYS = new Set(["dueDate", "checklist"]);

export function CardFace({ card, labels, project, config, onOpen, onArchive }: CardFaceProps) {
  const terminal = isTerminalStatus(card.status);
  const cfg = config ?? [];
  const labelList = labels ?? [];

  const showStatus = cfg.includes("status");
  const middleNodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => MIDDLE_KEYS.has(k)),
  );
  const bottomLeftNodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => BOTTOM_LEFT_KEYS.has(k)),
  );
  const bottomRightNodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => BOTTOM_RIGHT_KEYS.has(k)),
  );
  const showMiddle = project !== undefined || middleNodes.length > 0;

  return (
    <article
      aria-label={`Card: ${card.title}`}
      className="group rounded-[var(--radius-md)] border border-line-subtle bg-elevated px-2.5 py-2 transition-colors duration-[var(--dur-fast)] hover:border-line hover:bg-hover"
    >
      <div className="flex items-start gap-1.5">
        {showStatus ? (
          <span className="mt-[3px] shrink-0">
            <StatusBadge status={card.status} />
          </span>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <span
            className={
              terminal
                ? "line-clamp-2 text-base leading-snug text-fg-faint line-through"
                : "line-clamp-2 text-base leading-snug text-fg"
            }
          >
            {card.title}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Archive ${card.title}`}
          onClick={onArchive}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint opacity-0 transition-opacity duration-[var(--dur-fast)] hover:bg-surface hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-hover:opacity-100"
        >
          <Archive className="size-3.5" />
        </button>
      </div>

      {showMiddle ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {project ? <ProjectChip project={project} /> : null}
          {middleNodes}
        </div>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {bottomLeftNodes}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {bottomRightNodes}
          <span className="font-mono text-xs text-fg-faint">{card.shortId}</span>
        </div>
      </div>
    </article>
  );
}
