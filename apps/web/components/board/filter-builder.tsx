"use client";

import {
  type Filter,
  type FilterClause,
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type Label,
  isFilterGroup,
  Priority,
  PRIORITY_META,
  Severity,
  SEVERITY_META,
  STATUS_META,
  STATUS_ORDER,
} from "@boardly/domain";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@boardly/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";

// Linear-style filter editor: a chip bar over the nestable AND/OR model in
// @boardly/domain. Each active clause is a removable chip; a group has an
// AND/OR toggle; one level of nested groups is supported (the model allows
// deeper, but the UI caps at one nest for clarity — Unit V1.2).

type ValueKind = "status" | "priority" | "severity" | "label" | "assignee" | "dueWindow" | "text";

interface OpDef {
  condition: FilterCondition;
  label: string;
  /** Value editor to show; omitted for the set/empty predicates. */
  kind?: ValueKind;
}

// Only operators `evaluateFilter` actually supports, per field.
const OPS: Record<FilterField, OpDef[]> = {
  status: [
    { condition: "is", label: "is", kind: "status" },
    { condition: "isNot", label: "is not", kind: "status" },
  ],
  priority: [
    { condition: "is", label: "is", kind: "priority" },
    { condition: "isNot", label: "is not", kind: "priority" },
    { condition: "isSet", label: "is set" },
    { condition: "isEmpty", label: "is empty" },
  ],
  severity: [
    { condition: "is", label: "is", kind: "severity" },
    { condition: "isNot", label: "is not", kind: "severity" },
    { condition: "isSet", label: "is set" },
    { condition: "isEmpty", label: "is empty" },
  ],
  label: [
    { condition: "hasAny", label: "has any of", kind: "label" },
    { condition: "hasAll", label: "has all of", kind: "label" },
    { condition: "isSet", label: "is set" },
    { condition: "isEmpty", label: "is empty" },
  ],
  assignee: [
    { condition: "is", label: "is", kind: "assignee" },
    { condition: "isSet", label: "is set" },
    { condition: "isEmpty", label: "is empty" },
  ],
  dueDate: [
    { condition: "isWithin", label: "is", kind: "dueWindow" },
    { condition: "isSet", label: "is set" },
    { condition: "isEmpty", label: "is empty" },
  ],
  title: [{ condition: "contains", label: "contains", kind: "text" }],
};

const FIELD_LABELS: Record<FilterField, string> = {
  status: "Status",
  priority: "Priority",
  severity: "Severity",
  label: "Label",
  dueDate: "Due date",
  assignee: "Assignee",
  title: "Title",
};
const FIELDS = Object.keys(FIELD_LABELS) as FilterField[];

interface Opt {
  value: string | number;
  label: string;
}
const DUE_OPTS: Opt[] = [
  { value: "overdue", label: "overdue" },
  { value: "today", label: "today" },
  { value: "week", label: "this week" },
];
const ASSIGNEE_OPTS: Opt[] = [{ value: "@me", label: "me" }];
const STATUS_OPTS: Opt[] = STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].name }));
const PRIORITY_OPTS: Opt[] = [Priority.Urgent, Priority.High, Priority.Medium, Priority.Low].map(
  (p) => ({ value: p, label: PRIORITY_META[p].name }),
);
const SEVERITY_OPTS: Opt[] = (Object.values(Severity) as number[])
  .sort((a, b) => a - b)
  .map((s) => ({ value: s, label: SEVERITY_META[s as keyof typeof SEVERITY_META].name }));

function optionsFor(kind: ValueKind, labels: Label[]): Opt[] {
  switch (kind) {
    case "status":
      return STATUS_OPTS;
    case "priority":
      return PRIORITY_OPTS;
    case "severity":
      return SEVERITY_OPTS;
    case "assignee":
      return ASSIGNEE_OPTS;
    case "dueWindow":
      return DUE_OPTS;
    case "label":
      return labels.map((l) => ({ value: l.id, label: l.name }));
    case "text":
      return [];
  }
}

const opDef = (clause: FilterClause): OpDef =>
  OPS[clause.field].find((o) => o.condition === clause.condition) ?? OPS[clause.field][0]!;

/** Sensible starting clause when a field is first added. */
function defaultClause(field: FilterField): FilterClause {
  switch (field) {
    case "status":
      return { field, condition: "is", values: [STATUS_ORDER[0]!] };
    case "priority":
      return { field, condition: "is", values: [Priority.Urgent] };
    case "severity":
      return { field, condition: "is", values: [Severity.S1] };
    case "label":
      return { field, condition: "hasAny", values: [] };
    case "assignee":
      return { field, condition: "is", values: ["@me"] };
    case "dueDate":
      return { field, condition: "isWithin", values: ["week"] };
    case "title":
      return { field, condition: "contains", values: [""] };
  }
}

/** Compact human summary of a clause's values for the chip face. */
function describeValues(clause: FilterClause, labels: Label[]): string {
  const kind = opDef(clause).kind;
  if (!kind) return "";
  if (kind === "text") return `“${String(clause.values?.[0] ?? "")}”`;
  const opts = optionsFor(kind, labels);
  const names = (clause.values ?? []).map(
    (v) => opts.find((o) => o.value === v)?.label ?? String(v),
  );
  return names.length ? names.join(", ") : "…";
}

export function FilterBuilder({
  labels,
  filter,
  onChange,
}: {
  labels: Label[];
  filter: Filter;
  onChange: (next: Filter) => void;
}) {
  const empty = filter.clauses.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {empty ? <p className="px-1 text-xs text-fg-faint">No filters — showing all cards.</p> : null}
      <GroupEditor group={filter} labels={labels} onChange={onChange} depth={0} />
    </div>
  );
}

function GroupEditor({
  group,
  labels,
  onChange,
  onRemove,
  depth,
}: {
  group: FilterGroup;
  labels: Label[];
  onChange: (next: FilterGroup) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const setChild = (i: number, next: FilterClause | FilterGroup): void =>
    onChange({ ...group, clauses: group.clauses.map((c, j) => (j === i ? next : c)) });
  const removeChild = (i: number): void =>
    onChange({ ...group, clauses: group.clauses.filter((_, j) => j !== i) });
  const addClause = (field: FilterField): void =>
    onChange({ ...group, clauses: [...group.clauses, defaultClause(field)] });
  const addGroup = (): void =>
    onChange({
      ...group,
      clauses: [...group.clauses, { op: "and", clauses: [defaultClause("priority")] }],
    });

  const nested = depth > 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        nested && "rounded-[var(--radius-md)] border border-line-subtle bg-surface/50 p-2",
      )}
    >
      {group.clauses.length >= 2 ? (
        <div className="flex items-center gap-1 px-1">
          <span className="text-xs text-fg-faint">Match</span>
          <Conjunction op={group.op} onChange={(op) => onChange({ ...group, op })} />
          {nested && onRemove ? (
            <button
              type="button"
              aria-label="Remove group"
              onClick={onRemove}
              className="ml-auto grid size-5 place-items-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {group.clauses.map((child, i) =>
          isFilterGroup(child) ? (
            <div key={i} className="w-full">
              <GroupEditor
                group={child}
                labels={labels}
                onChange={(next) => setChild(i, next)}
                onRemove={() => removeChild(i)}
                depth={depth + 1}
              />
            </div>
          ) : (
            <ClauseChip
              key={i}
              clause={child}
              labels={labels}
              onChange={(next) => setChild(i, next)}
              onRemove={() => removeChild(i)}
            />
          ),
        )}

        <AddFilter onPick={addClause} />
        {!nested ? (
          <Button variant="ghost" size="sm" className="h-7 text-fg-faint" onClick={addGroup}>
            <Plus className="size-3.5" />
            Group
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Conjunction({ op, onChange }: { op: "and" | "or"; onChange: (op: "and" | "or") => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-[var(--radius-sm)] border border-line">
      {(["and", "or"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={op === v}
          onClick={() => onChange(v)}
          className={cn(
            "px-2 py-0.5 text-xs capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            op === v ? "bg-overlay text-fg" : "text-fg-muted hover:bg-overlay/60",
          )}
        >
          {v === "and" ? "all" : "any"}
        </button>
      ))}
    </div>
  );
}

function AddFilter({ onPick }: { onPick: (field: FilterField) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-fg-muted">
          <Plus className="size-3.5" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-0">
        <Command>
          <CommandInput placeholder="Filter by…" />
          <CommandList>
            <CommandEmpty>No field.</CommandEmpty>
            <CommandGroup>
              {FIELDS.map((f) => (
                <CommandItem
                  key={f}
                  value={FIELD_LABELS[f]}
                  onSelect={() => {
                    onPick(f);
                    setOpen(false);
                  }}
                >
                  {FIELD_LABELS[f]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ClauseChip({
  clause,
  labels,
  onChange,
  onRemove,
}: {
  clause: FilterClause;
  labels: Label[];
  onChange: (next: FilterClause) => void;
  onRemove: () => void;
}) {
  const def = opDef(clause);
  const summary = describeValues(clause, labels);
  return (
    <span className="inline-flex items-center overflow-hidden rounded-[var(--radius-sm)] border border-line bg-elevated text-sm">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Edit ${FIELD_LABELS[clause.field]} filter`}
            className="flex items-center gap-1 px-2 py-1 text-fg hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <span className="text-fg-muted">{FIELD_LABELS[clause.field]}</span>
            <span className="text-fg-faint">{def.label}</span>
            {def.kind ? <span className="font-medium">{summary}</span> : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-64 flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            {OPS[clause.field].map((op) => (
              <button
                key={op.condition}
                type="button"
                aria-pressed={op.condition === clause.condition}
                onClick={() => onChange(applyOperator(clause, op))}
                className={cn(
                  "rounded-[var(--radius-sm)] px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                  op.condition === clause.condition
                    ? "bg-overlay text-fg"
                    : "text-fg-muted hover:bg-overlay/60",
                )}
              >
                {op.label}
              </button>
            ))}
          </div>
          <ValueEditor clause={clause} labels={labels} onChange={onChange} />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove ${FIELD_LABELS[clause.field]} filter`}
        onClick={onRemove}
        className="grid size-7 place-items-center border-l border-line text-fg-faint hover:bg-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/** Switch a clause's operator, keeping/seeding values so the clause stays valid. */
function applyOperator(clause: FilterClause, op: OpDef): FilterClause {
  if (!op.kind) return { field: clause.field, condition: op.condition };
  const keep =
    clause.values && clause.values.length ? clause.values : defaultClause(clause.field).values;
  return { field: clause.field, condition: op.condition, values: keep };
}

function ValueEditor({
  clause,
  labels,
  onChange,
}: {
  clause: FilterClause;
  labels: Label[];
  onChange: (next: FilterClause) => void;
}) {
  const kind = opDef(clause).kind;
  if (!kind) return null;

  if (kind === "text") {
    return (
      <input
        aria-label="Title contains"
        placeholder="contains…"
        value={String(clause.values?.[0] ?? "")}
        onChange={(e) => onChange({ ...clause, values: [e.target.value] })}
        className="h-7 w-full rounded-[var(--radius-sm)] border border-line bg-elevated px-2 text-sm text-fg outline-none placeholder:text-fg-faint focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      />
    );
  }

  const opts = optionsFor(kind, labels);
  if (opts.length === 0) {
    return <p className="px-1 text-xs text-fg-faint">No options on this board.</p>;
  }
  // dueWindow is single-select; everything else multi-select.
  const single = kind === "dueWindow";
  const selected = new Set(clause.values ?? []);
  const toggle = (v: string | number): void => {
    if (single) {
      onChange({ ...clause, values: [v] });
      return;
    }
    const next = selected.has(v)
      ? (clause.values ?? []).filter((x) => x !== v)
      : [...(clause.values ?? []), v];
    onChange({ ...clause, values: next });
  };

  return (
    <div role="listbox" aria-multiselectable={!single} className="flex flex-col gap-0.5">
      {opts.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="option"
          aria-selected={selected.has(o.value)}
          onClick={() => toggle(o.value)}
          className={cn(
            "flex items-center justify-between rounded-[var(--radius-sm)] px-2 py-1 text-left text-sm hover:bg-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            selected.has(o.value) ? "text-fg" : "text-fg-muted",
          )}
        >
          {o.label}
          {selected.has(o.value) ? (
            <span className="text-[var(--accent)]" aria-hidden>
              ✓
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
