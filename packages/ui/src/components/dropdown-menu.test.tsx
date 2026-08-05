// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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

  it("renders a checkbox item with menuitemcheckbox semantics and toggles it", async () => {
    const onCheckedChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked onCheckedChange={onCheckedChange}>
            Backlog
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    const item = await screen.findByRole("menuitemcheckbox", { name: "Backlog" });
    expect(item).toHaveAttribute("aria-checked", "true");
    fireEvent.click(item);
    // Negates the current value, so a checked item reports false.
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("hides the check indicator when a checkbox item is unchecked", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked={false}>Backlog</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Todo</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    const unchecked = await screen.findByRole("menuitemcheckbox", { name: "Backlog" });
    const checked = screen.getByRole("menuitemcheckbox", { name: "Todo" });
    expect(unchecked).toHaveAttribute("aria-checked", "false");
    // Radix only mounts ItemIndicator (and thus the lucide <svg>) when checked.
    expect(unchecked.querySelector("svg")).toBeNull();
    expect(checked.querySelector("svg")).not.toBeNull();
  });

  it("does not toggle a disabled checkbox item", async () => {
    const onCheckedChange = vi.fn();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem disabled checked={false} onCheckedChange={onCheckedChange}>
            Backlog
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Backlog" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("keeps the menu open when a checkbox item preventDefaults its select", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Actions" />
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked onSelect={(e) => e.preventDefault()}>
            Backlog
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    open();
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Backlog" }));
    expect(screen.getByRole("menu")).toBeVisible();
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
