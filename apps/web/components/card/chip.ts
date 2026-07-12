// Shared card-face chip shell: a compact, fully-rounded bordered pill. Every
// info element on a card face (project, severity, due, checklist, priority,
// label) wears this shell so they read as one family — meaning comes from the
// icon/dot inside, not from differing container shapes (Linear convention).
export const CHIP =
  "inline-flex h-[18px] items-center gap-1 rounded-full border border-line px-1.5 text-[11px] leading-none text-fg";

// Icon-only variant (e.g. the priority glyph): tighter padding, no text gap.
export const CHIP_ICON =
  "inline-flex h-[18px] items-center justify-center rounded-full border border-line px-1 leading-none";
