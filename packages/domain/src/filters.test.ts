import { describe, expect, it } from "vitest";

import { Priority } from "./enums";
import {
  type Filter,
  PRESET_VIEWS,
  type ResolvedView,
  type SavedView,
  deriveCardDefaults,
  emptyFilter,
  evaluateFilter,
  groupCards,
  groupLabel,
  isEmptyFilter,
  resolveView,
  sortCards,
} from "./filters";
import { Status } from "./status";
import type { Card } from "./types";

const NOW = new Date("2026-07-10T12:00:00Z").getTime();

describe("deriveCardDefaults", () => {
  const and = (...clauses: Filter["clauses"]): Filter => ({ op: "and", clauses });

  it("derives projectId from a single project `is` clause", () => {
    const f = and({ field: "project", condition: "is", values: ["p1"] });
    expect(deriveCardDefaults(f)).toEqual({ projectId: "p1" });
  });

  it("derives priority and labels together", () => {
    const f = and(
      { field: "priority", condition: "is", values: [Priority.Urgent] },
      { field: "label", condition: "hasAny", values: ["l1", "l2"] },
    );
    expect(deriveCardDefaults(f)).toEqual({ priority: Priority.Urgent, labelIds: ["l1", "l2"] });
  });

  it("unions label ids across multiple label clauses (hasAny + hasAll)", () => {
    const f = and(
      { field: "label", condition: "hasAny", values: ["l1"] },
      { field: "label", condition: "hasAll", values: ["l2", "l3"] },
    );
    expect(deriveCardDefaults(f)).toEqual({ labelIds: ["l1", "l2", "l3"] });
  });

  it("returns {} for a top-level OR group", () => {
    const f: Filter = {
      op: "or",
      clauses: [{ field: "project", condition: "is", values: ["p1"] }],
    };
    expect(deriveCardDefaults(f)).toEqual({});
  });

  it("ignores negations, ranges, text, assignee, and status clauses", () => {
    const f = and(
      { field: "priority", condition: "isNot", values: [Priority.High] },
      { field: "dueDate", condition: "isWithin", values: ["week"] },
      { field: "title", condition: "contains", values: ["bug"] },
      { field: "assignee", condition: "is", values: ["@me"] },
      { field: "status", condition: "is", values: [Status.Done] },
    );
    expect(deriveCardDefaults(f)).toEqual({});
  });

  it("skips multi-value priority/project (a card has exactly one)", () => {
    const f = and({ field: "priority", condition: "is", values: [Priority.High, Priority.Urgent] });
    expect(deriveCardDefaults(f)).toEqual({});
  });

  it("ignores nested groups (top-level only) but still reads sibling clauses", () => {
    const f = and(
      { op: "and", clauses: [{ field: "priority", condition: "is", values: [Priority.Urgent] }] },
      { field: "project", condition: "is", values: ["p1"] },
    );
    // The nested priority is ignored; the direct project clause is read.
    expect(deriveCardDefaults(f)).toEqual({ projectId: "p1" });
  });

  it("returns {} for the empty filter", () => {
    expect(deriveCardDefaults(emptyFilter())).toEqual({});
  });
});

function card(over: Partial<Card>): Card {
  return {
    id: over.id ?? "c",
    number: 1,
    shortId: "#1",
    title: "Card",
    description: "",
    ord: "a0",
    status: Status.Todo,
    priority: Priority.None,
    dueDate: null,
    labelIds: [],
    relatedIds: [],
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

  it("scopes by project (is / isSet / isEmpty)", () => {
    const isP1 = and({ field: "project", condition: "is", values: ["p1"] });
    expect(evaluateFilter(card({ projectId: "p1" }), isP1, ctx)).toBe(true);
    expect(evaluateFilter(card({ projectId: "p2" }), isP1, ctx)).toBe(false);
    expect(evaluateFilter(card({}), isP1, ctx)).toBe(false); // no project → not in p1

    const hasProject = and({ field: "project", condition: "isSet" });
    expect(evaluateFilter(card({ projectId: "p1" }), hasProject, ctx)).toBe(true);
    expect(evaluateFilter(card({}), hasProject, ctx)).toBe(false);

    const noProject = and({ field: "project", condition: "isEmpty" });
    expect(evaluateFilter(card({}), noProject, ctx)).toBe(true);
    expect(evaluateFilter(card({ projectId: "p1" }), noProject, ctx)).toBe(false);
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
    const noLabels = and({ field: "label", condition: "isEmpty" });
    expect(evaluateFilter(card({ labelIds: [] }), noLabels, ctx)).toBe(true);
    expect(evaluateFilter(card({ labelIds: ["a"] }), noLabels, ctx)).toBe(false);
  });

  it("a stale clause referencing a removed field (e.g. severity) matches every card, not throws", () => {
    // Legacy persisted saved view: `field` is no longer a valid `FilterField`
    // at compile time, but must still degrade safely at runtime.
    const stale = {
      op: "and",
      clauses: [{ field: "severity", condition: "is", values: [1] }],
    } as unknown as Filter;
    expect(() => evaluateFilter(card({}), stale, ctx)).not.toThrow();
    expect(evaluateFilter(card({}), stale, ctx)).toBe(true);
    expect(evaluateFilter(card({ priority: Priority.Urgent }), stale, ctx)).toBe(true);
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

describe("groupCards", () => {
  it("groups by priority (natural order) with a trailing ungrouped lane for None", () => {
    const cards = [
      card({ id: "none", priority: Priority.None }),
      card({ id: "high", priority: Priority.High }),
      card({ id: "urgent", priority: Priority.Urgent }),
    ];
    const groups = groupCards(cards, "priority");
    expect(groups.map((g) => g.key)).toEqual([String(Priority.Urgent), String(Priority.High), ""]);
    expect(groups.at(-1)!.cards.map((c) => c.id)).toEqual(["none"]); // ungrouped last
  });

  it("groups by label (multi-valued: a card appears in each of its label lanes)", () => {
    const cards = [
      card({ id: "a", labelIds: ["bug", "p0"] }),
      card({ id: "b", labelIds: ["bug"] }),
      card({ id: "c", labelIds: [] }),
    ];
    const groups = groupCards(cards, "label");
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.cards.map((c) => c.id)]));
    expect(byKey["bug"]).toEqual(["a", "b"]);
    expect(byKey["p0"]).toEqual(["a"]);
    expect(byKey[""]).toEqual(["c"]); // no-label lane
    expect(groups.at(-1)!.key).toBe(""); // ungrouped last
  });

  it("groups by assignee with an Unassigned lane last", () => {
    const groups = groupCards([card({ id: "x", assigneeId: "u1" }), card({ id: "y" })], "assignee");
    expect(groups.map((g) => g.key)).toEqual(["u1", ""]);
  });

  it("a legacy groupBy referencing a removed field (e.g. severity) resolves to a single ungrouped lane, not a crash", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const legacyGroupBy = "severity" as unknown as Parameters<typeof groupCards>[1];
    expect(() => groupCards(cards, legacyGroupBy)).not.toThrow();
    const groups = groupCards(cards, legacyGroupBy);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("");
    expect(groups[0]!.cards.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("groupLabel", () => {
  it("resolves enum keys to display names", () => {
    expect(groupLabel("status", Status.InProgress)).toBe("In Progress");
    expect(groupLabel("priority", String(Priority.Urgent))).toBe("Urgent");
  });

  it("names the ungrouped lane per field", () => {
    expect(groupLabel("priority", "")).toBe("No priority");
    expect(groupLabel("label", "")).toBe("No label");
    expect(groupLabel("assignee", "")).toBe("Unassigned");
  });

  it("a legacy groupBy referencing a removed field (e.g. severity) resolves to a generic label, not undefined", () => {
    const legacyGroupBy = "severity" as unknown as Parameters<typeof groupLabel>[0];
    expect(groupLabel(legacyGroupBy, "")).toBe("Ungrouped");
  });

  it("resolves a label key via the provided name, else the raw id", () => {
    expect(groupLabel("label", "lbl1", { labelName: "Bug" })).toBe("Bug");
    expect(groupLabel("label", "lbl1")).toBe("lbl1");
    expect(groupLabel("assignee", "u1")).toBe("u1");
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

describe("resolveView", () => {
  const asFlat = (r: ResolvedView): Card[] => {
    if (!("flat" in r)) throw new Error("expected a flat result");
    return r.flat;
  };

  it("filters, then sorts, then groups (grouped result)", () => {
    const cards = [
      card({ id: "a", priority: Priority.Low, status: Status.Todo }),
      card({ id: "b", priority: Priority.Urgent, status: Status.Todo }),
      card({ id: "c", priority: Priority.High, status: Status.Done }),
      card({ id: "d", priority: Priority.Medium, status: Status.Todo }),
    ];
    const r = resolveView(
      cards,
      {
        filter: and({ field: "status", condition: "is", values: [Status.Todo] }),
        sort: { field: "priority", direction: "desc" },
        groupBy: "priority",
      },
      ctx,
    );
    if (!("grouped" in r)) throw new Error("expected grouped");
    // "c" is filtered out (Done); remaining sorted desc then grouped by priority.
    expect(r.grouped.map((g) => g.key)).toEqual([
      String(Priority.Urgent),
      String(Priority.Medium),
      String(Priority.Low),
    ]);
    expect(r.grouped.flatMap((g) => g.cards.map((c) => c.id))).toEqual(["b", "d", "a"]);
  });

  it("ungrouped returns a stable flat sort", () => {
    const cards = [
      card({ id: "low", priority: Priority.Low }),
      card({ id: "urgent", priority: Priority.Urgent }),
      card({ id: "med", priority: Priority.Medium }),
    ];
    const r = resolveView(cards, { sort: { field: "priority", direction: "desc" } }, ctx);
    expect(asFlat(r).map((c) => c.id)).toEqual(["urgent", "med", "low"]);
  });

  it("empty filter + no sort returns all cards in input (board) order", () => {
    const cards = [card({ id: "x" }), card({ id: "y" }), card({ id: "z" })];
    expect(asFlat(resolveView(cards, {}, ctx)).map((c) => c.id)).toEqual(["x", "y", "z"]);
    expect(asFlat(resolveView(cards, { filter: emptyFilter() }, ctx)).map((c) => c.id)).toEqual([
      "x",
      "y",
      "z",
    ]);
  });

  it("does not mutate the input cards array", () => {
    const cards = [
      card({ id: "low", priority: Priority.Low }),
      card({ id: "urgent", priority: Priority.Urgent }),
    ];
    resolveView(cards, { sort: { field: "priority", direction: "desc" } }, ctx);
    expect(cards.map((c) => c.id)).toEqual(["low", "urgent"]);
  });
});

describe("SavedView round-trip", () => {
  it("restores filter + sort + groupBy + layout exactly through JSON", () => {
    const view: SavedView = {
      id: "v1",
      name: "Open bugs, list",
      filter: or(
        { field: "priority", condition: "is", values: [Priority.High] },
        and(
          { field: "label", condition: "hasAny", values: ["bug"] },
          { field: "status", condition: "isNot", values: [Status.Done] },
        ),
      ),
      sort: { field: "priority", direction: "desc" },
      groupBy: "status",
      layout: "list",
      visibleBadges: ["priority", "dueDate"],
    };
    const restored = JSON.parse(JSON.stringify(view)) as SavedView;
    expect(restored).toEqual(view);
    // The restored lens drives resolveView identically.
    const cards = [
      card({ id: "hi", priority: Priority.High, status: Status.Todo }),
      card({ id: "done", priority: Priority.High, status: Status.Done }),
    ];
    const from = (v: SavedView): unknown =>
      resolveView(cards, { filter: v.filter, sort: v.sort, groupBy: v.groupBy }, ctx);
    expect(from(restored)).toEqual(from(view));
  });

  it("layout is optional and defaults to undefined (back-compat with pre-V1.1 views)", () => {
    const legacy: SavedView = { id: "v0", name: "Legacy", filter: emptyFilter() };
    const restored = JSON.parse(JSON.stringify(legacy)) as SavedView;
    expect(restored.layout).toBeUndefined();
    // Callers treat absent layout as "board".
    expect(restored.layout ?? "board").toBe("board");
  });
});
