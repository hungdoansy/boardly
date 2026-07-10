"use client";

import {
  type Filter,
  type FilterClause,
  type FilterCondition,
  type FilterField,
  isFilterGroup,
  Priority,
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
} from "@boardly/domain";
import { Button } from "@boardly/ui";
import { Plus, X } from "lucide-react";

// The builder edits a flat AND-of-clauses filter. The model + evaluator support
// OR/nesting (and are unit-tested); this UI covers the common case.
const FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  severity: "Severity",
  label: "Label",
  dueDate: "Due date",
  assignee: "Assignee",
  title: "Title",
};

/** Default condition + a value editor per field. */
function defaultClause(field: FilterField): FilterClause {
  switch (field) {
    case "status":
      return { field, condition: "is", values: [STATUS_ORDER[0]!] };
    case "priority":
      return { field, condition: "is", values: [Priority.Urgent] };
    case "dueDate":
      return { field, condition: "isWithin", values: ["week"] };
    case "title":
      return { field, condition: "contains", values: [""] };
    case "assignee":
      return { field, condition: "is", values: ["@me"] };
    default:
      return { field, condition: "isSet" };
  }
}

const clausesOf = (filter: Filter): FilterClause[] =>
  filter.clauses.filter((c): c is FilterClause => !isFilterGroup(c));

export function FilterBuilder({
  filter,
  onChange,
}: {
  filter: Filter;
  onChange: (next: Filter) => void;
}) {
  const clauses = clausesOf(filter);
  const setClauses = (next: FilterClause[]): void => onChange({ op: "and", clauses: next });

  return (
    <div className="flex flex-col gap-2">
      {clauses.length === 0 ? (
        <p className="px-1 text-xs text-fg-faint">No filters — showing all cards.</p>
      ) : null}

      {clauses.map((clause, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-16 shrink-0 text-xs text-fg-muted">{i === 0 ? "Where" : "and"}</span>
          <select
            aria-label="Filter field"
            value={clause.field}
            onChange={(e) =>
              setClauses(
                clauses.map((c, j) => (j === i ? defaultClause(e.target.value as FilterField) : c)),
              )
            }
            className="h-7 rounded-[var(--radius-sm)] border border-line bg-elevated px-1.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            {(Object.keys(FIELD_LABELS) as FilterField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>

          <ValueEditor
            clause={clause}
            onChange={(next) => setClauses(clauses.map((c, j) => (j === i ? next : c)))}
          />

          <button
            type="button"
            aria-label="Remove filter"
            onClick={() => setClauses(clauses.filter((_, j) => j !== i))}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="self-start text-fg-muted"
        onClick={() => setClauses([...clauses, defaultClause("priority")])}
      >
        <Plus className="size-3.5" />
        Add filter
      </Button>
    </div>
  );
}

/** Per-field value control. Kept compact; conditions are field-appropriate. */
function ValueEditor({
  clause,
  onChange,
}: {
  clause: FilterClause;
  onChange: (next: FilterClause) => void;
}) {
  const selectClass =
    "h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-elevated px-1.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

  if (clause.field === "priority") {
    return (
      <select
        aria-label="Priority value"
        value={String(clause.values?.[0] ?? Priority.Urgent)}
        onChange={(e) => onChange({ ...clause, condition: "is", values: [Number(e.target.value)] })}
        className={selectClass}
      >
        {[Priority.Urgent, Priority.High, Priority.Medium, Priority.Low].map((p) => (
          <option key={p} value={p}>
            {PRIORITY_META[p].name}
          </option>
        ))}
      </select>
    );
  }
  if (clause.field === "status") {
    return (
      <select
        aria-label="Status value"
        value={String(clause.values?.[0] ?? STATUS_ORDER[0])}
        onChange={(e) => onChange({ ...clause, condition: "is", values: [e.target.value] })}
        className={selectClass}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].name}
          </option>
        ))}
      </select>
    );
  }
  if (clause.field === "dueDate") {
    return (
      <select
        aria-label="Due window"
        value={String(clause.values?.[0] ?? "week")}
        onChange={(e) => onChange({ ...clause, condition: "isWithin", values: [e.target.value] })}
        className={selectClass}
      >
        <option value="overdue">is overdue</option>
        <option value="today">is due today</option>
        <option value="week">is due this week</option>
      </select>
    );
  }
  if (clause.field === "title") {
    return (
      <input
        aria-label="Title contains"
        placeholder="contains…"
        value={String(clause.values?.[0] ?? "")}
        onChange={(e) => onChange({ ...clause, condition: "contains", values: [e.target.value] })}
        className={selectClass}
      />
    );
  }
  // severity / label / assignee → set/empty toggle.
  return (
    <select
      aria-label="Condition"
      value={clause.condition}
      onChange={(e) => onChange({ ...clause, condition: e.target.value as FilterCondition })}
      className={selectClass}
    >
      <option value="isSet">is set</option>
      <option value="isEmpty">is empty</option>
    </select>
  );
}
