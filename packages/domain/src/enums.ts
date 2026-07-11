// Domain enums. Modeled as `const` objects (not TS `enum`) so they are
// tree-shakeable, isolatedModules-safe, and serialize as plain JSON values.

/** Card priority, low→high. Stored on the card as a 0–4 number. */
export const Priority = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4,
} as const;
export type PriorityValue = (typeof Priority)[keyof typeof Priority];
export type PriorityName = keyof typeof Priority;
export const PRIORITY_NAMES: Record<PriorityValue, PriorityName> = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/**
 * Card severity S1 (most severe) … S4. Stored as a 1–4 number, or `null` when
 * unset (a card with no severity renders no severity badge).
 */
export const Severity = {
  S1: 1,
  S2: 2,
  S3: 3,
  S4: 4,
} as const;
export type SeverityValue = (typeof Severity)[keyof typeof Severity];
export type SeverityName = keyof typeof Severity;
export const SEVERITY_NAMES: Record<SeverityValue, SeverityName> = {
  1: "S1",
  2: "S2",
  3: "S3",
  4: "S4",
};

/** Display name + color per priority level (DESIGN.md §2 encodings). */
export const PRIORITY_META: Record<PriorityValue, { name: PriorityName; color: string }> = {
  0: { name: "None", color: "#6B6F76" },
  1: { name: "Low", color: "#8A8F98" },
  2: { name: "Medium", color: "#4EA7FC" },
  3: { name: "High", color: "#E2B341" },
  4: { name: "Urgent", color: "#EB5757" },
};

/**
 * Display name + color per severity (DESIGN.md §2 encodings). S3 is a
 * distinct gold (not Priority.High's `#E2B341` amber) — the two badges sit
 * side by side in the card badge row, and identical hues there read as one
 * blurred signal rather than two.
 */
export const SEVERITY_META: Record<SeverityValue, { name: SeverityName; color: string }> = {
  1: { name: "S1", color: "#EB5757" },
  2: { name: "S2", color: "#F2994A" },
  3: { name: "S3", color: "#D9A441" },
  4: { name: "S4", color: "#6B6F76" },
};

/**
 * Link provider ids. The full extensible provider registry (incl. GitHub PR /
 * issue) is built in Unit 2.7; this is the base set the domain helpers detect.
 */
export const LinkProvider = {
  Slack: "slack",
  Linear: "linear",
  GitHub: "github",
  Claude: "claude",
  Generic: "generic",
} as const;
export type LinkProvider = (typeof LinkProvider)[keyof typeof LinkProvider];
