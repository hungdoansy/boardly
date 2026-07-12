import { type Filter, type Label, evaluateFilter, Priority, Status } from "@boardly/domain";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { FilterBuilder } from "./filter-builder";

afterEach(cleanup);

const NOW = new Date("2026-07-10T12:00:00Z").getTime();
const ctx = { now: NOW };
const LABELS: Label[] = [
  { id: "lbl-bug", name: "bug", color: "#f00", ord: "a0" },
  { id: "lbl-feat", name: "feat", color: "#0f0", ord: "a1" },
];

function makeCard(over: Partial<import("@boardly/domain").Card>): import("@boardly/domain").Card {
  return {
    id: "c",
    number: 1,
    shortId: "#1",
    title: "Card",
    description: "",
    ord: "a0",
    status: Status.Todo,
    priority: Priority.None,
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

/** Controlled harness: accumulates edits so multi-step interactions build a real Filter. */
let current: Filter;
function Harness({ labels = LABELS }: { labels?: Label[] } = {}) {
  const [filter, setFilter] = useState<Filter>({ op: "and", clauses: [] });
  current = filter;
  return (
    <FilterBuilder
      labels={labels}
      filter={filter}
      onChange={(f) => {
        current = f;
        setFilter(f);
      }}
    />
  );
}

/** Open the add-filter picker and choose a field by its label. */
function addField(field: string, container: HTMLElement = document.body): void {
  const scope = within(container);
  fireEvent.click(scope.getAllByRole("button", { name: "Filter" })[0]!);
  // The field picker renders in a portal (document.body).
  fireEvent.click(screen.getByRole("option", { name: field }));
}

describe("FilterBuilder", () => {
  it("shows an empty state when there are no clauses", () => {
    render(<Harness />);
    expect(screen.getByText(/no filters/i)).toBeInTheDocument();
  });

  it("adds a field as a chip via the picker (default clause)", () => {
    render(<Harness />);
    addField("Priority");
    expect(current.clauses).toEqual([
      { field: "priority", condition: "is", values: [Priority.Urgent] },
    ]);
    // The chip renders the field + operator.
    expect(screen.getByRole("button", { name: "Edit Priority filter" })).toBeInTheDocument();
  });

  it("offers only field-appropriate operators", () => {
    render(<Harness />);
    addField("Priority");
    fireEvent.click(screen.getByRole("button", { name: "Edit Priority filter" }));
    // Priority supports is / is not / is set / is empty — not the label set ops.
    expect(screen.getByRole("button", { name: "is set" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "is empty" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "has any of" })).not.toBeInTheDocument();

    cleanup();
    render(<Harness />);
    addField("Status");
    fireEvent.click(screen.getByRole("button", { name: "Edit Status filter" }));
    // Status is only is / is not.
    expect(screen.getByRole("button", { name: "is" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "is not" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "is set" })).not.toBeInTheDocument();
  });

  it("multi-selects enum values", () => {
    render(<Harness />);
    addField("Priority");
    fireEvent.click(screen.getByRole("button", { name: "Edit Priority filter" }));
    fireEvent.click(screen.getByRole("option", { name: "High" }));
    const clause = current.clauses[0];
    expect(clause).toMatchObject({ field: "priority", condition: "is" });
    expect((clause as { values: number[] }).values.sort()).toEqual(
      [Priority.Urgent, Priority.High].sort(),
    );
  });

  it("marks the selected value option with an SVG check, not a text glyph", () => {
    render(<Harness />);
    addField("Priority"); // default clause selects Urgent
    fireEvent.click(screen.getByRole("button", { name: "Edit Priority filter" }));
    const selectedOption = screen.getByRole("option", { name: "Urgent" });
    expect(selectedOption.querySelector("svg")).toBeInTheDocument();
    expect(selectedOption.textContent).not.toMatch(/✓/);
    const unselectedOption = screen.getByRole("option", { name: "High" });
    expect(unselectedOption.querySelector("svg")).not.toBeInTheDocument();
  });

  it("removing the last clause clears the filter (matches all)", () => {
    render(<Harness />);
    addField("Priority");
    expect(current.clauses).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove Priority filter" }));
    expect(current.clauses).toEqual([]);
    expect(screen.getByText(/no filters/i)).toBeInTheDocument();
    // An empty filter matches every card.
    expect(evaluateFilter(makeCard({ priority: Priority.Low }), current, ctx)).toBe(true);
  });

  it("builds an OR of two clauses and evaluates with OR semantics", () => {
    render(<Harness />);
    addField("Priority"); // priority is Urgent
    addField("Status"); // status is Backlog (STATUS_ORDER[0])
    // Switch the status clause to "is not".
    fireEvent.click(screen.getByRole("button", { name: "Edit Status filter" }));
    fireEvent.click(screen.getByRole("button", { name: "is not" }));
    // Flip the group conjunction to OR ("any").
    fireEvent.click(screen.getByRole("button", { name: "any" }));

    expect(current.op).toBe("or");
    // (priority is Urgent) OR (status is not Backlog)
    expect(
      evaluateFilter(makeCard({ priority: Priority.Urgent, status: Status.Backlog }), current, ctx),
    ).toBe(true);
    expect(
      evaluateFilter(makeCard({ priority: Priority.Low, status: Status.Todo }), current, ctx),
    ).toBe(true);
    expect(
      evaluateFilter(makeCard({ priority: Priority.Low, status: Status.Backlog }), current, ctx),
    ).toBe(false);
  });

  it("supports one level of nested groups (AND inside)", () => {
    render(<Harness />);
    // Add a nested group (seeded with a priority clause), then add a status clause inside it.
    fireEvent.click(screen.getByRole("button", { name: "Group" }));
    // The nested group box (clauses[0]) renders before the top-level trailing add
    // buttons, so its "Filter" button is first in DOM order.
    const filterButtons = screen.getAllByRole("button", { name: "Filter" });
    fireEvent.click(filterButtons[0]!);
    fireEvent.click(screen.getByRole("option", { name: "Status" }));

    const nested = current.clauses[0] as Filter;
    expect(nested.op).toBe("and");
    expect(nested.clauses).toHaveLength(2);
    // A nested group cannot spawn further groups (UI caps at one nest).
    expect(screen.getAllByRole("button", { name: "Group" })).toHaveLength(1);

    // Top-level AND-of(group): both nested clauses must hold.
    expect(
      evaluateFilter(makeCard({ priority: Priority.Urgent, status: Status.Backlog }), current, ctx),
    ).toBe(true);
    expect(
      evaluateFilter(makeCard({ priority: Priority.Urgent, status: Status.Todo }), current, ctx),
    ).toBe(false);
  });

  it("edits a label clause using the board's labels", () => {
    render(<Harness />);
    addField("Label"); // hasAny []
    fireEvent.click(screen.getByRole("button", { name: "Edit Label filter" }));
    fireEvent.click(screen.getByRole("option", { name: "bug" }));
    expect(current.clauses[0]).toEqual({
      field: "label",
      condition: "hasAny",
      values: ["lbl-bug"],
    });
  });
});
