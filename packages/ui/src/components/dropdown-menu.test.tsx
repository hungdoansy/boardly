// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

afterEach(cleanup);

// Radix's dropdown trigger opens on pointerdown/keyboard, not a bare click event;
// Enter is the deterministic path in jsdom.
function open(): void {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions" }), { key: "Enter" });
}

describe("DropdownMenu", () => {
  it("has no open menu initially, then opens on click showing its items", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuItem>Archive all</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    open();
    const menu = await screen.findByRole("menu");
    expect(menu).toBeVisible();
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("fires onSelect and closes the menu when an item is chosen", async () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Archive all</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive all" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuItem>Archive all</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    await screen.findByRole("menu");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
