import { type SeverityValue, SEVERITY_META } from "@boardly/domain";

/**
 * Small `S#` pill, color-coded (DESIGN.md §2). Tinted fill + a solid left
 * accent bar carry the color; the text itself stays a neutral, always-legible
 * foreground — a solid fill behind white text failed contrast for the
 * lighter hues (S2/S3 especially) in both themes.
 */
export function SeverityBadge({ severity }: { severity: SeverityValue }) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className="inline-flex h-[18px] items-center rounded-[var(--radius-sm)] border-l-2 pl-1.5 pr-1.5 text-[11px] font-semibold text-fg"
      style={{
        borderLeftColor: meta.color,
        backgroundColor: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
      }}
      title={`Severity: ${meta.name}`}
    >
      {meta.name}
    </span>
  );
}
