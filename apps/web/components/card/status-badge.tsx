import { type Status, STATUS_META } from "@boardly/domain";
import { StatusIcon, type StatusVariant } from "@boardly/ui";

/** Status glyph, colored per the domain metadata. `label` adds the name beside it. */
export function StatusBadge({
  status,
  label = false,
  className,
}: {
  status: Status;
  label?: boolean;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1"
      title={`Status: ${meta.name}`}
      aria-label={`Status: ${meta.name}`}
    >
      <StatusIcon variant={status as StatusVariant} color={meta.color} className={className} />
      {label ? <span className="text-xs text-fg-muted">{meta.name}</span> : null}
    </span>
  );
}
