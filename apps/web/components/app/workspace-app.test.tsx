// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createMemoryContext } from "@boardly/commands";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { getSelectedProject, setSelectedProject } from "../../lib/use-projects";
import { Sidebar, useGlobalKeyboard } from "./workspace-app";

beforeEach(() => setSelectedProject(null)); // reset the module-level scope
afterEach(() => cleanup());

/** True when `a` comes before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function renderSidebar(props?: Partial<Parameters<typeof Sidebar>[0]>) {
  const ctx = createMemoryContext();
  const onOpenSearch = vi.fn();
  const onOpenSettings = vi.fn();
  const utils = render(
    <BoardlyProvider context={ctx}>
      <Sidebar
        onOpenSearch={onOpenSearch}
        settingsOpen={false}
        onOpenSettings={onOpenSettings}
        {...props}
      />
    </BoardlyProvider>,
  );
  return { ctx, onOpenSearch, onOpenSettings, ...utils };
}

describe("Sidebar placement (R12)", () => {
  it("renders, top-to-bottom, logo → search → projects → Settings → account footer", () => {
    renderSidebar();
    const logo = screen.getByText("Boardly");
    const search = screen.getByRole("button", { name: /Search/ });
    const projects = screen.getByRole("navigation", { name: "Projects" });
    const settings = screen.getByRole("button", { name: "Settings" });
    const account = screen.getByRole("button", { name: /Account/ });

    // Settings is a full-width nav item positioned last, above the account footer.
    expect(precedes(logo, search)).toBe(true);
    expect(precedes(search, projects)).toBe(true);
    expect(precedes(projects, settings)).toBe(true);
    expect(precedes(settings, account)).toBe(true);
  });

  it("renders the Boardly brand mark beside the wordmark", () => {
    const { container } = renderSidebar();
    // The <BoardlyMark/> inlines an <svg>; the wordmark text sits next to it.
    expect(container.querySelector("[data-boardly-mark] svg")).not.toBeNull();
    expect(screen.getByText("Boardly")).toBeInTheDocument();
  });

  it("Settings opens the settings pane and reflects aria-pressed", () => {
    const { onOpenSettings, rerender, ctx } = renderSidebar();
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    // When the settings route is active the item shows itself as pressed.
    rerender(
      <BoardlyProvider context={ctx}>
        <Sidebar onOpenSearch={vi.fn()} settingsOpen onOpenSettings={vi.fn()} />
      </BoardlyProvider>,
    );
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("ESC escape ladder (R13)", () => {
  function mountLadder(settingsOpen: boolean) {
    const onOpenSearch = vi.fn();
    const onExitSettings = vi.fn();
    const view = renderHook(
      (props: { settingsOpen: boolean }) =>
        useGlobalKeyboard({ onOpenSearch, onExitSettings, settingsOpen: props.settingsOpen }),
      { initialProps: { settingsOpen } },
    );
    return { onOpenSearch, onExitSettings, ...view };
  }

  function pressEscape(target: EventTarget = document): void {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  }

  it("with Settings open, ESC exits Settings (does not touch scope)", () => {
    setSelectedProject("p1");
    const { onExitSettings } = mountLadder(true);
    pressEscape();
    expect(onExitSettings).toHaveBeenCalledTimes(1);
    expect(getSelectedProject()).toBe("p1"); // scope untouched — ladder stops at Settings
  });

  it("with a project scoped and no Settings, ESC resets scope to All", () => {
    setSelectedProject("p1");
    const { onExitSettings } = mountLadder(false);
    pressEscape();
    expect(getSelectedProject()).toBeNull();
    expect(onExitSettings).not.toHaveBeenCalled();
  });

  it("ESC while an editable input is focused does NOT reset scope", () => {
    setSelectedProject("p1");
    mountLadder(false);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    pressEscape(input); // target is the input → shared editable guard bails
    expect(getSelectedProject()).toBe("p1");
    input.remove();
  });

  it("ESC while an open Radix dialog is present does NOT reset scope (ladder yields)", () => {
    setSelectedProject("p1");
    mountLadder(false);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);
    pressEscape();
    expect(getSelectedProject()).toBe("p1");
    dialog.remove();
  });
});
