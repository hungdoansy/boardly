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
  const onOpenHelp = vi.fn();
  const onOpenArchive = vi.fn();
  const utils = render(
    <BoardlyProvider context={ctx}>
      <Sidebar
        onOpenSearch={onOpenSearch}
        onOpenHelp={onOpenHelp}
        settingsOpen={false}
        onOpenSettings={onOpenSettings}
        archiveOpen={false}
        onOpenArchive={onOpenArchive}
        {...props}
      />
    </BoardlyProvider>,
  );
  return { ctx, onOpenSearch, onOpenSettings, onOpenHelp, onOpenArchive, ...utils };
}

describe("Sidebar placement (R12)", () => {
  it("renders, top-to-bottom, logo → search → projects → Archive → Settings → account footer", () => {
    renderSidebar();
    const logo = screen.getByText("Boardly");
    const search = screen.getByRole("button", { name: /Search/ });
    const projects = screen.getByRole("navigation", { name: "Projects" });
    const archive = screen.getByRole("button", { name: "Archive" });
    const settings = screen.getByRole("button", { name: "Settings" });
    const account = screen.getByRole("button", { name: /Account/ });

    // Archive + Settings are full-width nav items positioned last (Archive above
    // Settings), above the account footer.
    expect(precedes(logo, search)).toBe(true);
    expect(precedes(search, projects)).toBe(true);
    expect(precedes(projects, archive)).toBe(true);
    expect(precedes(archive, settings)).toBe(true);
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
        <Sidebar
          onOpenSearch={vi.fn()}
          onOpenHelp={vi.fn()}
          settingsOpen
          onOpenSettings={vi.fn()}
          archiveOpen={false}
          onOpenArchive={vi.fn()}
        />
      </BoardlyProvider>,
    );
    expect(screen.getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Archive opens the archive pane and reflects aria-pressed", () => {
    const { onOpenArchive, rerender, ctx } = renderSidebar();
    const archive = screen.getByRole("button", { name: "Archive" });
    expect(archive).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(archive);
    expect(onOpenArchive).toHaveBeenCalledTimes(1);

    rerender(
      <BoardlyProvider context={ctx}>
        <Sidebar
          onOpenSearch={vi.fn()}
          onOpenHelp={vi.fn()}
          settingsOpen={false}
          onOpenSettings={vi.fn()}
          archiveOpen
          onOpenArchive={vi.fn()}
        />
      </BoardlyProvider>,
    );
    expect(screen.getByRole("button", { name: "Archive" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ESC escape ladder (R13)", () => {
  function mountLadder(settingsOpen: boolean, archiveOpen = false) {
    const onOpenSearch = vi.fn();
    const onOpenHelp = vi.fn();
    const onExitSettings = vi.fn();
    const onExitArchive = vi.fn();
    const view = renderHook(
      (props: { settingsOpen: boolean; archiveOpen: boolean }) =>
        useGlobalKeyboard({
          onOpenSearch,
          onOpenHelp,
          onExitSettings,
          settingsOpen: props.settingsOpen,
          onExitArchive,
          archiveOpen: props.archiveOpen,
        }),
      { initialProps: { settingsOpen, archiveOpen } },
    );
    return { onOpenSearch, onOpenHelp, onExitSettings, onExitArchive, ...view };
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

  it("with Archive open (no Settings), ESC exits Archive (does not touch scope)", () => {
    setSelectedProject("p1");
    const { onExitArchive, onExitSettings } = mountLadder(false, true);
    pressEscape();
    expect(onExitArchive).toHaveBeenCalledTimes(1);
    expect(onExitSettings).not.toHaveBeenCalled();
    expect(getSelectedProject()).toBe("p1"); // scope untouched — ladder stops at Archive
  });

  it("Settings takes ESC precedence over Archive when both are open", () => {
    const { onExitSettings, onExitArchive } = mountLadder(true, true);
    pressEscape();
    expect(onExitSettings).toHaveBeenCalledTimes(1);
    expect(onExitArchive).not.toHaveBeenCalled();
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

describe("Global shortcuts (search / help / new task)", () => {
  function mountGlobal() {
    const onOpenSearch = vi.fn();
    const onOpenHelp = vi.fn();
    const onExitSettings = vi.fn();
    const onExitArchive = vi.fn();
    renderHook(() =>
      useGlobalKeyboard({
        onOpenSearch,
        onOpenHelp,
        onExitSettings,
        settingsOpen: false,
        onExitArchive,
        archiveOpen: false,
      }),
    );
    return { onOpenSearch, onOpenHelp, onExitSettings };
  }

  function press(init: KeyboardEventInit, target: EventTarget = document): void {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
      );
    });
  }

  /** A Todo column with an add-card composer button, mirroring the real board. */
  function mountTodoComposer(): { clickSpy: ReturnType<typeof vi.fn>; cleanup: () => void } {
    const col = document.createElement("div");
    col.setAttribute("data-nav-column", "todo");
    const composer = document.createElement("button");
    composer.setAttribute("data-nav-composer", "");
    const clickSpy = vi.fn();
    composer.addEventListener("click", clickSpy);
    col.appendChild(composer);
    document.body.appendChild(col);
    return { clickSpy, cleanup: () => col.remove() };
  }

  it("`/` opens search; `?` opens the shortcuts overlay (and not search)", () => {
    const { onOpenSearch, onOpenHelp } = mountGlobal();
    press({ key: "/" });
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(onOpenHelp).not.toHaveBeenCalled();
    press({ key: "?" });
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1); // `?` did not also open search
  });

  it("`c` opens the Todo column composer", () => {
    const { clickSpy, cleanup: cleanupCol } = mountTodoComposer();
    mountGlobal();
    press({ code: "KeyC" });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    cleanupCol();
  });

  it("`c` yields while an overlay dialog is open", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);
    const { clickSpy, cleanup: cleanupCol } = mountTodoComposer();
    mountGlobal();
    press({ code: "KeyC" });
    expect(clickSpy).not.toHaveBeenCalled();
    dialog.remove();
    cleanupCol();
  });

  it("`c` does nothing while typing in a field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { clickSpy, cleanup: cleanupCol } = mountTodoComposer();
    mountGlobal();
    press({ code: "KeyC" }, input);
    expect(clickSpy).not.toHaveBeenCalled();
    input.remove();
    cleanupCol();
  });

  it("`c` yields when the board already consumed it (defaultPrevented)", () => {
    const { clickSpy, cleanup: cleanupCol } = mountTodoComposer();
    mountGlobal();
    // Simulate the board's focused-column `c` handler consuming the event first
    // (capture-phase runs before useGlobalKeyboard's bubble-phase listener).
    const consume = (e: KeyboardEvent): void => e.preventDefault();
    document.addEventListener("keydown", consume, true);
    press({ code: "KeyC" });
    document.removeEventListener("keydown", consume, true);
    expect(clickSpy).not.toHaveBeenCalled();
    cleanupCol();
  });

  it("`c` does NOT fall back to a non-Todo column composer (no wrong-status create)", () => {
    // Only a Backlog composer exists (Todo hidden+empty). `c` must not open it —
    // Backlog precedes Todo in STATUS_ORDER, so a DOM-order fallback would create
    // the card in the wrong status.
    const col = document.createElement("div");
    col.setAttribute("data-nav-column", "backlog");
    const composer = document.createElement("button");
    composer.setAttribute("data-nav-composer", "");
    const clickSpy = vi.fn();
    composer.addEventListener("click", clickSpy);
    col.appendChild(composer);
    document.body.appendChild(col);

    mountGlobal();
    press({ code: "KeyC" });
    expect(clickSpy).not.toHaveBeenCalled();
    col.remove();
  });
});
