"use client";

import {
  type ActivityEntry,
  formatAbsoluteDate,
  formatRelativeTime,
  PRIORITY_META,
  STATUS_META,
} from "@boardly/domain";
import {
  ArchiveRestore,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Flag,
  Plus,
  Type as TypeIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { useCardActivity } from "../../lib/use-board";

/** How many entries to render before a "Show older" affordance (perf on busy cards). */
const PAGE = 30;

export function CardActivity({ cardId }: { cardId: string }) {
  const entries = useCardActivity(cardId);
  const [limit, setLimit] = useState(PAGE);

  if (entries.length === 0) {
    return <p className="text-sm text-fg-faint">No activity yet.</p>;
  }

  const shown = entries.slice(0, limit);
  return (
    <ol aria-label="Activity" className="flex flex-col gap-2.5">
      {shown.map((entry) => (
        <ActivityRow key={entry.id} entry={entry} />
      ))}
      {entries.length > limit ? (
        <li>
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE)}
            className="rounded-[var(--radius-sm)] px-1 text-xs text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Show {entries.length - limit} older
          </button>
        </li>
      ) : null}
    </ol>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { icon, text } = describe(entry);
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="grid h-5 w-4 shrink-0 place-items-center text-fg-faint">{icon}</span>
      <span className="min-w-0 flex-1 leading-5 text-fg-muted">{text}</span>
      <time
        className="h-5 shrink-0 text-xs leading-5 tabular-nums text-fg-faint"
        dateTime={new Date(entry.at).toISOString()}
        title={formatAbsoluteDate(entry.at, true)}
      >
        {formatRelativeTime(entry.at, Date.now())}
      </time>
    </li>
  );
}

const STRONG = "font-medium text-fg";

/** "<field> → <value>" with the transition arrow as an SVG (not a glyph). */
function Transition({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {label}
      <ArrowRight className="size-3 shrink-0 text-fg-faint" aria-hidden />
      <span className={STRONG}>{children}</span>
    </span>
  );
}

/** Map an entry to an icon + human-readable description. */
function describe(entry: ActivityEntry): { icon: ReactNode; text: ReactNode } {
  const cls = "size-3.5";
  switch (entry.type) {
    case "created":
      return { icon: <Plus className={cls} />, text: <>Created</> };
    case "archived":
      return { icon: <CheckCircle2 className={cls} />, text: <>Archived</> };
    case "unarchived":
      return { icon: <ArchiveRestore className={cls} />, text: <>Restored</> };
    case "renamed":
      return {
        icon: <TypeIcon className={cls} />,
        text: (
          <>
            Renamed to <span className={STRONG}>{entry.to}</span>
          </>
        ),
      };
    // Legacy: column moves are no longer produced (a card's column is its
    // status), but pre-existing "moved" entries may still be in the log.
    case "moved":
      return { icon: <ArrowRight className={cls} />, text: <>Moved</> };
    case "status":
      return {
        icon: <CircleDot className={cls} />,
        text: <Transition label="Status">{STATUS_META[entry.to].name}</Transition>,
      };
    case "priority":
      return {
        icon: <Flag className={cls} />,
        text: <Transition label="Priority">{PRIORITY_META[entry.to].name}</Transition>,
      };
    case "due":
      return {
        icon: <CircleDot className={cls} />,
        text:
          entry.to === null ? (
            <>Due date cleared</>
          ) : (
            <>
              Due <span className={STRONG}>{formatAbsoluteDate(entry.to)}</span>
            </>
          ),
      };
  }
}
