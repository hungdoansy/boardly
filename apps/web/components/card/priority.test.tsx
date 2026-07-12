// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { Priority } from "@boardly/domain";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PriorityBadge } from "./priority-badge";
import { PrioritySelect } from "./priority-select";

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
