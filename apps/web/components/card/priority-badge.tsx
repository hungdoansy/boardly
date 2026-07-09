import { type PriorityValue, PRIORITY_META, Priority } from "@boardly/domain";

/** Linear-style priority glyph: bar-height icon (Urgent is a filled alert). */
export function PriorityIcon({ level, className }: { level: PriorityValue; className?: string }) {
  const color = PRIORITY_META[level].color;

  if (level === Priority.Urgent) {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" className={className} aria-hidden="true">
        <rect x="1" y="1" width="12" height="12" rx="3" fill={color} />
        <rect x="6" y="3.5" width="2" height="4.5" rx="1" fill="#fff" />
        <circle cx="7" cy="10" r="1.1" fill="#fff" />
      </svg>
    );
  }

  const bars = [
    { x: 1, h: 5 },
    { x: 5.5, h: 9 },
    { x: 10, h: 13 },
  ];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className={className} aria-hidden="true">
      {bars.map((b, i) => (
        <rect
          key={b.x}
          x={b.x}
          y={14 - b.h}
          width="3"
          height={b.h}
          rx="1"
          fill={i < level ? color : "var(--text-tertiary)"}
          opacity={i < level ? 1 : 0.35}
        />
      ))}
    </svg>
  );
}

export function PriorityBadge({ priority }: { priority: PriorityValue }) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className="inline-flex items-center"
      title={`Priority: ${meta.name}`}
      aria-label={`Priority: ${meta.name}`}
    >
      <PriorityIcon level={priority} />
    </span>
  );
}
