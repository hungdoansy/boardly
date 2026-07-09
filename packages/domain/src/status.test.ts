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

  it("has metadata for every status value, with a valid category", () => {
    const categories = new Set(Object.values(StatusCategory));
    for (const value of STATUS_VALUES) {
      const meta = STATUS_META[value];
      expect(meta.name.length).toBeGreaterThan(0);
      expect(categories.has(meta.category)).toBe(true);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("orders every status exactly once, workflow left→right", () => {
    expect([...STATUS_ORDER].sort()).toEqual([...STATUS_VALUES].sort());
    expect(STATUS_ORDER.indexOf(Status.Backlog)).toBeLessThan(STATUS_ORDER.indexOf(Status.Done));
    expect(STATUS_ORDER.indexOf(Status.InProgress)).toBeLessThan(
      STATUS_ORDER.indexOf(Status.InReview),
    );
  });

  it("classifies terminal statuses (done / canceled)", () => {
    expect(isDoneStatus(Status.Done)).toBe(true);
    expect(isDoneStatus(Status.InProgress)).toBe(false);
    expect(isCanceledStatus(Status.Canceled)).toBe(true);
    expect(isCanceledStatus(Status.Done)).toBe(false);
    expect(isTerminalStatus(Status.Done)).toBe(true);
    expect(isTerminalStatus(Status.Canceled)).toBe(true);
    expect(isTerminalStatus(Status.Todo)).toBe(false);
  });
});
