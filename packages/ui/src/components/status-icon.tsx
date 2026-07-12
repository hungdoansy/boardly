import type * as React from "react";

/** Workflow-status glyph variants (mirror `@boardly/domain` Status values). */
export type StatusVariant =
  | "backlog"
  | "todo"
  | "in_progress"
  | "pending"
  | "in_review"
  | "done"
  | "canceled"
  | "duplicate";

/** Fraction of the progress pie filled for the "started" states. */
const PROGRESS: Partial<Record<StatusVariant, number>> = {
  in_progress: 0.5,
  pending: 0.3,
  in_review: 0.8,
};

const CENTER = 7;
const RING_R = 5;
const PIE_R = 3;

/** SVG path for a pie wedge of `fraction` (clockwise from 12 o'clock). */
function pie(fraction: number): string {
  if (fraction <= 0) return "";
  if (fraction >= 1) {
    return `M${CENTER} ${CENTER - PIE_R} A${PIE_R} ${PIE_R} 0 1 1 ${CENTER - 0.01} ${CENTER - PIE_R} Z`;
  }
  const angle = -Math.PI / 2 + fraction * 2 * Math.PI;
  const x = CENTER + PIE_R * Math.cos(angle);
  const y = CENTER + PIE_R * Math.sin(angle);
  const largeArc = fraction > 0.5 ? 1 : 0;
  return `M${CENTER} ${CENTER} L${CENTER} ${CENTER - PIE_R} A${PIE_R} ${PIE_R} 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

/**
 * Linear-style workflow status icon. Self-contained SVG (no icon dep), colored
 * by the `color` prop so the domain owns the palette. Renders an outline ring
 * for unstarted states, a progress pie for started ones, a filled disc with a
 * check / cross for done / canceled, and an outlined square-slash for duplicate.
 */
export function StatusIcon({
  variant,
  color,
  className,
  size = 14,
}: {
  variant: StatusVariant;
  color: string;
  className?: string;
  size?: number;
}) {
  const filled = variant === "done" || variant === "canceled";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {filled ? (
        <>
          <circle cx={CENTER} cy={CENTER} r={RING_R + 1} fill={color} />
          {variant === "done" ? (
            <path
              d="M4.3 7.1 L6.1 8.9 L9.7 5"
              fill="none"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M5 5 L9 9 M9 5 L5 9"
              fill="none"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
        </>
      ) : variant === "duplicate" ? (
        <>
          <rect
            x={2.5}
            y={2.5}
            width={9}
            height={9}
            rx={1.5}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
          />
          <path
            d="M2.2 11.8 L11.8 2.2"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray={variant === "backlog" ? "1.6 1.6" : undefined}
          />
          {PROGRESS[variant] ? <path d={pie(PROGRESS[variant]!)} fill={color} /> : null}
        </>
      )}
    </svg>
  );
}

export type StatusIconProps = React.ComponentProps<typeof StatusIcon>;
