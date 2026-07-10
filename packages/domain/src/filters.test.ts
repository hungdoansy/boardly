import { describe, expect, it } from "vitest";

import { Priority, Severity } from "./enums";
import {
  type Filter,
  PRESET_VIEWS,
  emptyFilter,
  evaluateFilter,
  isEmptyFilter,
  sortCards,
} from "./filters";
import { Status } from "./status";
import type { Card } from "./types";

const NOW = new Date("2026-07-10T12:00:00Z").getTime();

function card(over: Partial<Card>): Card {
  return {
    id: over.id ?? "c",
    shortId: "BRD-1",
    title: "Card",
    description: "",
    columnId: "col",
    ord: "a0",
    status: Status.Todo,
    priority: Priority.None,
    severity: null,
    dueDate: null,
    labelIds: [],
    checklist: [],
    links: [],
    archived: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const ctx = { now: NOW };
const and = (...clauses: Filter["clauses"]): Filter => ({ op: "and", clauses });
const or = (...clauses: Filter["clauses"]): Filter => ({ op: "or", clauses });

describe("evaluateFilter", () => {
  it("an empty filter matches everything", () => {
    expect(isEmptyFilter(emptyFilter())).toBe(true);
    expect(evaluateFilter(card({}), emptyFilter(), ctx)).toBe(true);
  });

  it("AND of priority=High and label=bug", () => {
    const filter = and(
      { field: "priority", condition: "is", values: [Priority.High] },
      { field: "label", condition: "hasAny", values: ["bug"] },
    );
    expect(evaluateFilter(card({ priority: Priority.High, labelIds: ["bug"] }), filter, ctx)).toBe(
      true,
    );
    expect(evaluateFilter(card({ priority: Priority.High, labelIds: ["feat"] }), filter, ctx)).toBe(
      false,
    );
    expect(evaluateFilter(card({ priority: Priority.Low, labelIds: ["bug"] }), filter, ctx)).toBe(
      false,
    );
  });

  it("OR groups and nesting combine correctly", () => {
    // (status is Done) OR (priority is Urgent AND label hasAny [p0])
    const filter = or(
      { field: "status", condition: "is", values: [Status.Done] },
      and(
        { field: "priority", condition: "is", values: [Priority.Urgent] },
        { field: "label", condition: "hasAny", values: ["p0"] },
      ),
    );
    expect(evaluateFilter(card({ status: Status.Done }), filter, ctx)).toBe(true);
    expect(evaluateFilter(card({ priority: Priority.Urgent, labelIds: ["p0"] }), filter, ctx)).toBe(
      true,
    );
    expect(evaluateFilter(card({ priority: Priority.Urgent, labelIds: ["x"] }), filter, ctx)).toBe(
      false,
    );
  });

  it("isSet / isEmpty conditions", () => {
    const sevSet = and({ field: "severity", condition: "isSet" });
    expect(evaluateFilter(card({ severity: Severity.S1 }), sevSet, ctx)).toBe(true);
    expect(evaluateFilter(card({ severity: null }), sevSet, ctx)).toBe(false);

    const noLabels = and({ field: "label", condition: "isEmpty" });
    expect(evaluateFilter(card({ labelIds: [] }), noLabels, ctx)).toBe(true);
    expect(evaluateFilter(card({ labelIds: ["a"] }), noLabels, ctx)).toBe(false);
  });

  it("hasAll requires every label; hasAny requires one", () => {
    const all = and({ field: "label", condition: "hasAll", values: ["a", "b"] });
    expect(evaluateFilter(card({ labelIds: ["a", "b", "c"] }), all, ctx)).toBe(true);
    expect(evaluateFilter(card({ labelIds: ["a"] }), all, ctx)).toBe(false);
  });

  it("dueDate windows (overdue / today / week)", () => {
    const day = 86_400_000;
    const overdue = and({ field: "dueDate", condition: "isWithin", values: ["overdue"] });
    const thisWeek = and({ field: "dueDate", condition: "isWithin", values: ["week"] });
    expect(
      evaluateFilter(card({ dueDate: { at: NOW - 2 * day, hasTime: false } }), overdue, ctx),
    ).toBe(true);
    expect(
      evaluateFilter(card({ dueDate: { at: NOW + 2 * day, hasTime: false } }), overdue, ctx),
    ).toBe(false);
    expect(
      evaluateFilter(card({ dueDate: { at: NOW + 3 * day, hasTime: false } }), thisWeek, ctx),
    ).toBe(true);
    expect(
      evaluateFilter(card({ dueDate: { at: NOW + 30 * day, hasTime: false } }), thisWeek, ctx),
    ).toBe(false);
    expect(evaluateFilter(card({ dueDate: null }), thisWeek, ctx)).toBe(false);
  });

  it("title contains is case-insensitive", () => {
    const f = and({ field: "title", condition: "contains", values: ["AUTH"] });
    expect(evaluateFilter(card({ title: "Auth service" }), f, ctx)).toBe(true);
    expect(evaluateFilter(card({ title: "Login" }), f, ctx)).toBe(false);
  });

  it("assignee '@me' resolves to the current user", () => {
    const f = and({ field: "assignee", condition: "is", values: ["@me"] });
    expect(evaluateFilter(card({ assigneeId: "u1" }), f, { now: NOW, currentUserId: "u1" })).toBe(
      true,
    );
    expect(evaluateFilter(card({ assigneeId: "u2" }), f, { now: NOW, currentUserId: "u1" })).toBe(
      false,
    );
  });

  it("degrades gracefully for a deleted-label id (no crash, just no match)", () => {
    const f = and({ field: "label", condition: "hasAny", values: ["deleted-label-id"] });
    expect(() => evaluateFilter(card({ labelIds: ["real"] }), f, ctx)).not.toThrow();
    expect(evaluateFilter(card({ labelIds: ["real"] }), f, ctx)).toBe(false);
  });
});

describe("sortCards", () => {
  it("sorts by priority desc and does not mutate the input", () => {
    const cards = [
      card({ id: "low", priority: Priority.Low }),
      card({ id: "urgent", priority: Priority.Urgent }),
      card({ id: "med", priority: Priority.Medium }),
    ];
    const sorted = sortCards(cards, { field: "priority", direction: "desc" });
    expect(sorted.map((c) => c.id)).toEqual(["urgent", "med", "low"]);
    expect(cards.map((c) => c.id)).toEqual(["low", "urgent", "med"]); // original intact
  });

  it("sorts by dueDate asc with undated cards last", () => {
    const day = 86_400_000;
    const cards = [
      card({ id: "none", dueDate: null }),
      card({ id: "late", dueDate: { at: NOW + 5 * day, hasTime: false } }),
      card({ id: "soon", dueDate: { at: NOW + day, hasTime: false } }),
    ];
    expect(sortCards(cards, { field: "dueDate", direction: "asc" }).map((c) => c.id)).toEqual([
      "soon",
      "late",
      "none",
    ]);
  });
});

describe("preset views", () => {
  it("high-priority preset matches High and Urgent only", () => {
    const preset = PRESET_VIEWS.find((v) => v.id === "preset:high-priority")!;
    expect(evaluateFilter(card({ priority: Priority.Urgent }), preset.filter, ctx)).toBe(true);
    expect(evaluateFilter(card({ priority: Priority.High }), preset.filter, ctx)).toBe(true);
    expect(evaluateFilter(card({ priority: Priority.Medium }), preset.filter, ctx)).toBe(false);
  });
});
