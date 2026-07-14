// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "./context-menu";

afterEach(cleanup);

function open(): void {
  fireEvent.contextMenu(screen.getByText("Target"), { clientX: 10, clientY: 10 });
}

describe("ContextMenu", () => {
  it("opens on right-click and shows its items", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Rename</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive">Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    open();
    expect(await screen.findByText("Rename")).toBeVisible();
    expect(screen.getByText("Delete")).toBeVisible();
  });

  it("fires onSelect when an item is chosen", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onSelect}>Rename</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );
    open();
    fireEvent.click(await screen.findByText("Rename"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders a submenu trigger", async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>,
    );
    open();
    expect(await screen.findByText("Color")).toBeVisible();
  });
});
