import { describe, expect, it } from "vitest";

import {
  DEFAULT_STATUS,
  STATUS_META,
  STATUS_ORDER,
  STATUS_VALUES,
  Status,
  StatusCategory,
  isCanceledStatus,
  isDoneStatus,
  isTerminalStatus,
} from "./status";

describe("status enum + metadata", () => {
  it("defaults new cards to Todo", () => {
    expect(DEFAULT_STATUS).toBe(Status.Todo);
  });

  it("has exactly eight status values, including the two new ones", () => {
    expect(STATUS_VALUES).toHaveLength(8);
    expect(STATUS_VALUES).toContain(Status.Pending);
    expect(STATUS_VALUES).toContain(Status.Duplicate);
  });

  it("orders the fixed columns exactly Backlog…Duplicate", () => {
    expect(STATUS_ORDER).toEqual([
      Status.Backlog,
      Status.Todo,
      Status.Pending,
      Status.InProgress,
      Status.InReview,
      Status.Done,
      Status.Canceled,
      Status.Duplicate,
    ]);
  });

  it("orders every status exactly once, workflow left→right", () => {
    expect([...STATUS_ORDER].sort()).toEqual([...STATUS_VALUES].sort());
    expect(STATUS_ORDER.indexOf(Status.Backlog)).toBeLessThan(STATUS_ORDER.indexOf(Status.Done));
    expect(STATUS_ORDER.indexOf(Status.InProgress)).toBeLessThan(
      STATUS_ORDER.indexOf(Status.InReview),
    );
  });

  it("has metadata (name/category/color) for every status value", () => {
    const categories = new Set(Object.values(StatusCategory));
    for (const value of STATUS_VALUES) {
      const meta = STATUS_META[value];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(categories.has(meta.category)).toBe(true);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("assigns the resolved categories for the new statuses", () => {
    expect(STATUS_META[Status.Pending].category).toBe(StatusCategory.Started);
    expect(STATUS_META[Status.Duplicate].category).toBe(StatusCategory.Canceled);
    expect(STATUS_META[Status.Pending].name).toBe("Pending");
    expect(STATUS_META[Status.Duplicate].name).toBe("Duplicate");
  });

  it("classifies terminal statuses (done / canceled / duplicate)", () => {
    expect(isDoneStatus(Status.Done)).toBe(true);
    expect(isDoneStatus(Status.InProgress)).toBe(false);
    expect(isCanceledStatus(Status.Canceled)).toBe(true);
    expect(isCanceledStatus(Status.Duplicate)).toBe(true);
    expect(isCanceledStatus(Status.Done)).toBe(false);
    expect(isTerminalStatus(Status.Done)).toBe(true);
    expect(isTerminalStatus(Status.Canceled)).toBe(true);
    expect(isTerminalStatus(Status.Duplicate)).toBe(true);
    expect(isTerminalStatus(Status.Todo)).toBe(false);
  });
});
