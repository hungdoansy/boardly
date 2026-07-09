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

/**
 * Link provider ids. The full extensible provider registry (incl. GitHub PR /
 * issue) is built in Unit 2.7; this is the base set the domain helpers detect.
 */
export const LinkProvider = {
  Slack: "slack",
  Linear: "linear",
  Claude: "claude",
  Generic: "generic",
} as const;
export type LinkProvider = (typeof LinkProvider)[keyof typeof LinkProvider];
