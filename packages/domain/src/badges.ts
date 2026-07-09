// The card-face "highlighted" badge row is per-board configurable: `meta.badgeConfig`
// is an ordered list of field keys. These are the fields that have a renderer today;
// `links` (Unit 2.7) and `status` (Unit 2.12) are added to this list in their units.
export interface BadgeField {
  key: string;
  label: string;
}

export const BADGE_FIELDS: BadgeField[] = [
  { key: "priority", label: "Priority" },
  { key: "severity", label: "Severity" },
  { key: "dueDate", label: "Due date" },
  { key: "labels", label: "Labels" },
  { key: "checklist", label: "Checklist" },
];

/** Default ordered badge row for a new board. */
export const DEFAULT_BADGE_CONFIG: string[] = [
  "priority",
  "severity",
  "dueDate",
  "labels",
  "checklist",
];
