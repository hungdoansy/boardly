"use client";

import type { Card, Label, Project } from "@boardly/domain";
import { isTerminalStatus } from "@boardly/domain";

import { collectBadgeNodes } from "./badge-row";
import { ProjectChip } from "./project-chip";
import { StatusBadge } from "./status-badge";

interface CardFaceProps {
  card: Card;
  labels?: Label[];
  project?: Project;
  config?: string[];
  onOpen: () => void;
}

// The card face reads top-to-bottom in four fixed tiers — this order is a
// deliberate, locked-in spec (not to be reshuffled by future feature work):
//   • line 1  — the ticket id at the far left; due date and checklist are
//     pushed right.
//   • line 2  — status glyph leads the title (workflow state first).
//   • line 3  — labels.
//   • line 4  — urgency (priority) then links on the left, the project
//     badge pushed to the far right.
// Status/priority/links/due/checklist/project are placed by hand; labels keep
// the per-board configured order (the only remaining configurable field with
// its own tier). Archiving from the card face was removed (kept in the card
// detail drawer and the "e" keyboard shortcut) — see card.test.tsx history.
const LINE1_RIGHT_KEYS = new Set(["dueDate", "checklist"]);
const LABEL_KEYS = new Set(["labels"]);
const LINE3_KEYS = new Set(["priority", "links"]);

export function CardFace({ card, labels, project, config, onOpen }: CardFaceProps) {
  const terminal = isTerminalStatus(card.status);
  const cfg = config ?? [];
  const labelList = labels ?? [];

  const showStatus = cfg.includes("status");
  const line1RightNodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => LINE1_RIGHT_KEYS.has(k)),
  );
  const labelNodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => LABEL_KEYS.has(k)),
  );
  const line3Nodes = collectBadgeNodes(
    card,
    labelList,
    cfg.filter((k) => LINE3_KEYS.has(k)),
  );
  const showLine3 = project !== undefined || line3Nodes.length > 0;

  return (
    <article
      aria-label={`Card: ${card.title}`}
      className="rounded-[var(--radius-md)] border border-line-subtle bg-elevated px-2.5 py-2 transition-colors duration-[var(--dur-fast)] hover:border-line hover:bg-hover"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs text-fg-faint">{card.shortId}</span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          {line1RightNodes}
        </div>
      </div>

      <div className="mt-1.5 flex items-start gap-1.5">
        {showStatus ? (
          <span className="mt-px shrink-0">
            <StatusBadge status={card.status} />
          </span>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
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
      </div>

      {labelNodes.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-0.5">{labelNodes}</div>
      ) : null}

      {showLine3 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {line3Nodes}
          {project ? <ProjectChip project={project} className="ml-auto" /> : null}
        </div>
      ) : null}
    </article>
  );
}
