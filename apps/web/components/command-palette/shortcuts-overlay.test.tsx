// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShortcutsOverlay } from "./shortcuts-overlay";

afterEach(() => cleanup());

describe("ShortcutsOverlay", () => {
  it("lists shortcut groups and keys when open", () => {
    render(<ShortcutsOverlay open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    // A sampling across all three groups.
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Go to project")).toBeInTheDocument();
    expect(screen.getByText("New task")).toBeInTheDocument();
    expect(screen.getByText("Cycle priority")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<ShortcutsOverlay open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
