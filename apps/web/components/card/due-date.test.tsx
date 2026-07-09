// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DueChip, DueDatePicker } from "./due-date";

const NOW = new Date(2026, 6, 10, 12, 0).getTime();

afterEach(() => {
  cleanup();
});

describe("DueChip", () => {
  it("renders the relative label for a fixed now", () => {
    render(<DueChip due={{ at: new Date(2026, 6, 11).getTime(), hasTime: false }} now={NOW} />);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});

describe("DueDatePicker", () => {
  it("sets a date-only due date", () => {
    const onChange = vi.fn();
    render(<DueDatePicker value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.change(screen.getByLabelText("Due date input"), { target: { value: "2026-07-12" } });
    expect(onChange).toHaveBeenCalledWith({
      at: new Date("2026-07-12T00:00").getTime(),
      hasTime: false,
    });
  });

  it("clears the due date", () => {
    const onChange = vi.fn();
    render(
      <DueDatePicker
        value={{ at: new Date(2026, 6, 12).getTime(), hasTime: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("toggling include-time sets hasTime", () => {
    const onChange = vi.fn();
    render(
      <DueDatePicker
        value={{ at: new Date(2026, 6, 12).getTime(), hasTime: false }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Due date" }));
    fireEvent.click(screen.getByLabelText("Include time"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ hasTime: true }));
  });
});
