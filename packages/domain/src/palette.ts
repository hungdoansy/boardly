// Accessible-on-dark label palette (DESIGN.md §2). Users pick one per label;
// chips render the color at low alpha with a full-color dot/text.
export interface LabelColor {
  name: string;
  value: string;
}

export const LABEL_COLORS: LabelColor[] = [
  { name: "slate", value: "#8A8F98" },
  { name: "red", value: "#EB5757" },
  { name: "orange", value: "#F2994A" },
  { name: "amber", value: "#E2B341" },
  { name: "green", value: "#4CB782" },
  { name: "teal", value: "#3DB4B0" },
  { name: "blue", value: "#4EA7FC" },
  { name: "indigo", value: "#5E6AD2" },
  { name: "violet", value: "#9B7EDE" },
  { name: "pink", value: "#E06C9F" },
];

export const DEFAULT_LABEL_COLOR = LABEL_COLORS[1]!.value; // red
