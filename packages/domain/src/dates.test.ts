import { describe, expect, it } from "vitest";

import { describeDueDate, formatDueDate } from "./dates";

// Fixed "now": Jul 10 2026, 12:00 local (constructed from local parts so the
// helper's local-time formatting is deterministic on any runner TZ).
const NOW = new Date(2026, 6, 10, 12, 0).getTime();
const dateOnly = (y: number, m: number, d: number) => ({
  at: new Date(y, m, d).getTime(),
  hasTime: false,
});
const timed = (y: number, m: number, d: number, h: number, min = 0) => ({
  at: new Date(y, m, d, h, min).getTime(),
  hasTime: true,
});

describe("describeDueDate", () => {
  it("today (date-only)", () => {
    expect(describeDueDate(dateOnly(2026, 6, 10), NOW)).toEqual({ label: "Today", tone: "soon" });
  });
  it("tomorrow", () => {
    expect(describeDueDate(dateOnly(2026, 6, 11), NOW)).toEqual({
      label: "Tomorrow",
      tone: "soon",
    });
  });
  it("two days out → relative + soon", () => {
    expect(describeDueDate(dateOnly(2026, 6, 12), NOW)).toEqual({ label: "2d", tone: "soon" });
  });
  it("a week out → formatted date + normal", () => {
    expect(describeDueDate(dateOnly(2026, 6, 17), NOW)).toEqual({
      label: "Jul 17",
      tone: "normal",
    });
  });
  it("past date → Overdue", () => {
    expect(describeDueDate(dateOnly(2026, 6, 8), NOW)).toEqual({
      label: "Overdue",
      tone: "overdue",
    });
  });

  it("timed today shows the time", () => {
    expect(describeDueDate(timed(2026, 6, 10, 15, 0), NOW)).toEqual({
      label: "3:00 PM",
      tone: "soon",
    });
  });
  it("timed earlier today is overdue", () => {
    expect(describeDueDate(timed(2026, 6, 10, 9, 0), NOW)).toEqual({
      label: "Overdue",
      tone: "overdue",
    });
  });
});

describe("formatDueDate", () => {
  it("date only vs timed", () => {
    expect(formatDueDate(dateOnly(2026, 6, 12))).toBe("Jul 12");
    expect(formatDueDate(timed(2026, 6, 12, 15, 0))).toBe("Jul 12, 3:00 PM");
  });
});
