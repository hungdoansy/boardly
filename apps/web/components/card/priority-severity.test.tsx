// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { Priority } from "@boardly/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PriorityBadge } from "./priority-badge";
import { PrioritySelect } from "./priority-select";
import { SeverityBadge } from "./severity-badge";
import { SeveritySelect } from "./severity-select";

afterEach(() => {
  cleanup();
});

describe("priority", () => {
  it("badge exposes the level name", () => {
    render(<PriorityBadge priority={Priority.Urgent} />);
    expect(screen.getByLabelText("Priority: Urgent")).toBeInTheDocument();
  });

  it("select changes the value", () => {
    const onChange = vi.fn();
    render(<PrioritySelect value={Priority.None} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /urgent/i }));
    expect(onChange).toHaveBeenCalledWith(Priority.Urgent);
  });
});

describe("severity", () => {
  it("badge renders the S# label", () => {
    render(<SeverityBadge severity={2} />);
    expect(screen.getByText("S2")).toBeInTheDocument();
  });

  it("select sets a level and clears to null", () => {
    const onChange = vi.fn();
    render(<SeveritySelect value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Severity" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "S2" }));
    expect(onChange).toHaveBeenCalledWith(2);

    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Severity" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
