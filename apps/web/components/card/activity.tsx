"use client";

import {
  type ActivityEntry,
  type Column,
  formatRelativeTime,
  PRIORITY_META,
  SEVERITY_META,
  STATUS_META,
} from "@boardly/domain";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Flag,
  Plus,
  Signal,
  Type as TypeIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { useCardActivity, useColumns } from "../../lib/use-board";

/** How many entries to render before a "Show older" affordance (perf on busy cards). */
const PAGE = 30;

export function CardActivity({ boardId, cardId }: { boardId: string; cardId: string }) {
  const entries = useCardActivity(boardId, cardId);
  const columns = useColumns(boardId);
  const columnName = useMemo(() => {
    const map = new Map(columns.map((c: Column) => [c.id, c.title]));
    return (id: string | null): string =>
      id ? (map.get(id) ?? "another column") : "another column";
  }, [columns]);
  const [limit, setLimit] = useState(PAGE);

  if (entries.length === 0) {
    return <p className="text-sm text-fg-faint">No activity yet.</p>;
  }

  const shown = entries.slice(0, limit);
  return (
    <ol aria-label="Activity" className="flex flex-col gap-2.5">
      {shown.map((entry) => (
        <ActivityRow key={entry.id} entry={entry} columnName={columnName} />
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

function ActivityRow({
  entry,
  columnName,
}: {
  entry: ActivityEntry;
  columnName: (id: string | null) => string;
}) {
  const { icon, text } = describe(entry, columnName);
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center text-fg-faint">{icon}</span>
      <span className="min-w-0 flex-1 text-fg-muted">{text}</span>
      <time
        className="shrink-0 text-xs tabular-nums text-fg-faint"
        dateTime={new Date(entry.at).toISOString()}
        title={new Date(entry.at).toLocaleString()}
      >
        {formatRelativeTime(entry.at, Date.now())}
      </time>
    </li>
  );
}

const STRONG = "font-medium text-fg";

/** Map an entry to an icon + human-readable description. */
function describe(
  entry: ActivityEntry,
  columnName: (id: string | null) => string,
): { icon: ReactNode; text: ReactNode } {
  const cls = "size-3.5";
  switch (entry.type) {
    case "created":
      return { icon: <Plus className={cls} />, text: <>Created</> };
    case "archived":
      return { icon: <CheckCircle2 className={cls} />, text: <>Archived</> };
    case "renamed":
      return {
        icon: <TypeIcon className={cls} />,
        text: (
          <>
            Renamed to <span className={STRONG}>{entry.to}</span>
          </>
        ),
      };
    case "moved":
      return {
        icon: <ArrowRight className={cls} />,
        text: (
          <>
            Moved from <span className={STRONG}>{columnName(entry.from)}</span> to{" "}
            <span className={STRONG}>{columnName(entry.to)}</span>
          </>
        ),
      };
    case "status":
      return {
        icon: <CircleDot className={cls} />,
        text: (
          <>
            Status → <span className={STRONG}>{STATUS_META[entry.to].name}</span>
          </>
        ),
      };
    case "priority":
      return {
        icon: <Flag className={cls} />,
        text: (
          <>
            Priority → <span className={STRONG}>{PRIORITY_META[entry.to].name}</span>
          </>
        ),
      };
    case "severity":
      return {
        icon: <Signal className={cls} />,
        text: (
          <>
            Severity →{" "}
            <span className={STRONG}>
              {entry.to === null ? "None" : SEVERITY_META[entry.to].name}
            </span>
          </>
        ),
      };
    case "due":
      return {
        icon: <CircleDot className={cls} />,
        text:
          entry.to === null ? (
            <>Due date cleared</>
          ) : (
            <>
              Due <span className={STRONG}>{new Date(entry.to).toLocaleDateString()}</span>
            </>
          ),
      };
  }
}
