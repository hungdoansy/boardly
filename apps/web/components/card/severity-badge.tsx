import { type SeverityValue, SEVERITY_META } from "@boardly/domain";

/** Small solid S# pill, color-coded (DESIGN.md §2). */
export function SeverityBadge({ severity }: { severity: SeverityValue }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-[var(--radius-sm)] px-1.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: meta.color }}
      title={`Severity: ${meta.name}`}
    >
      {meta.name}
    </span>
  );
}
