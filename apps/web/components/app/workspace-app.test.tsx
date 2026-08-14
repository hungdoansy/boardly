// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  archiveProject,
  createCard,
  createMemoryContext,
  createProject,
  execute,
  type MemoryContext,
  saveView,
  showProject,
} from "@boardly/commands";
import { Priority, Status, STATUS_META } from "@boardly/domain";
import { allLiveCards, getCard, initBoard } from "@boardly/sync";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { showAllColumns } from "../../lib/hidden-columns";
import { getSelectedProject, setSelectedProject } from "../../lib/use-projects";
import { MainArea, Sidebar, useGlobalKeyboard } from "./workspace-app";

beforeEach(() => setSelectedProject(null)); // reset the module-level scope
afterEach(() => {
  cleanup();
  // Module singletons — a hide or a persisted flag would leak into the next test.
  showAllColumns();
  localStorage.clear();
});

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

/**
 * The board's one effective filter fans out to the toolbar's Columns menu and to
 * every card list under it, so these render the real `MainArea` rather than a
 * fixture that re-derives the filter: a composition bug is exactly the kind of
 * defect a duplicated composition would hide.
 */
describe("hidden projects are excluded from the All scope (UNIT-20)", () => {
  function renderMain(seed?: (ctx: MemoryContext) => void) {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Board", now: 0 });
    seed?.(ctx);
    render(
      <BoardlyProvider context={ctx}>
        <MainArea />
      </BoardlyProvider>,
    );
    return { ctx };
  }

  /** Web (visible, 1 card), Legacy (2 cards), 1 unassigned card — all in Backlog. */
  function seedBoard(ctx: MemoryContext): void {
    execute(createProject, ctx, { id: "pweb", name: "Web" });
    execute(createProject, ctx, { id: "plegacy", name: "Legacy" });
    const backlog = Status.Backlog;
    execute(createCard, ctx, { status: backlog, title: "Ship the picker", projectId: "pweb" });
    execute(createCard, ctx, { status: backlog, title: "Retire the cron", projectId: "plegacy" });
    execute(createCard, ctx, { status: backlog, title: "Delete the shim", projectId: "plegacy" });
    execute(createCard, ctx, { status: backlog, title: "Buy a domain" });
  }

  /** …with Legacy hidden. */
  function seedWithHidden(ctx: MemoryContext): void {
    seedBoard(ctx);
    execute(archiveProject, ctx, { projectId: "plegacy" });
  }

  const backlogHeader = (): HTMLElement =>
    screen
      .getByRole("region", { name: `Column: ${STATUS_META[Status.Backlog].name}` })
      .querySelector("header")!;

  /** Radix's dropdown trigger opens on pointerdown/keyboard, not a bare click. */
  function openColumnsMenu(): void {
    fireEvent.keyDown(screen.getByRole("button", { name: /^Columns/ }), { key: "Enter" });
  }

  function openBacklogMenu(): void {
    fireEvent.keyDown(
      screen.getByRole("button", { name: `${STATUS_META[Status.Backlog].name} column actions` }),
      { key: "Enter" },
    );
  }

  const liveTitles = (ctx: MemoryContext): string[] =>
    allLiveCards(ctx.getBoardDoc()).map((c) => c.title);

  it("renders only the visible-project and unassigned cards (AE1, R1, R2)", () => {
    renderMain(seedWithHidden);
    expect(screen.getByText("Ship the picker")).toBeInTheDocument();
    expect(screen.getByText("Buy a domain")).toBeInTheDocument();
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete the shim")).not.toBeInTheDocument();
  });

  it("excludes hidden-project cards from the column header count (AE2, R3)", () => {
    renderMain(seedWithHidden);
    expect(within(backlogHeader()).getByText("2")).toBeInTheDocument();
  });

  it("keeps the Columns menu counts equal to the header counts", async () => {
    renderMain(seedWithHidden);
    openColumnsMenu();
    await screen.findByRole("menu");
    const row = screen.getByRole("menuitemcheckbox", {
      name: new RegExp(`^${STATUS_META[Status.Backlog].name}`),
    });
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("archives only the visible cards from the column menu, and says so (AE2, R3)", async () => {
    const { ctx } = renderMain(seedWithHidden);
    openBacklogMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive all" }));
    expect(
      await screen.findByRole("heading", {
        name: `Archive all 2 cards in ${STATUS_META[Status.Backlog].name}?`,
      }),
    ).toBeVisible();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Archive all" }));
    });

    expect(liveTitles(ctx)).toEqual(["Retire the cron", "Delete the shim"]);
  });

  it("marks only the visible cards done from the column menu (R3)", async () => {
    const { ctx } = renderMain(seedWithHidden);
    openBacklogMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Mark all done" }));
    expect(
      await screen.findByRole("heading", {
        name: `Mark all 2 cards in ${STATUS_META[Status.Backlog].name} as done?`,
      }),
    ).toBeVisible();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all done" }));
    });

    const doneTitles = allLiveCards(ctx.getBoardDoc())
      .filter((c) => c.status === Status.Done)
      .map((c) => c.title);
    expect(doneTitles).toEqual(["Ship the picker", "Buy a domain"]);
  });

  it("brings the cards straight back when the project is shown again (AE6, R9)", () => {
    const { ctx } = renderMain(seedWithHidden);
    const kept = screen.getByText("Ship the picker");

    act(() => {
      execute(showProject, ctx, { projectId: "plegacy" });
    });

    expect(screen.getByText("Retire the cron")).toBeInTheDocument();
    expect(within(backlogHeader()).getByText("4")).toBeInTheDocument();
    // No card was mutated, and the board re-derived rather than remounted.
    expect(screen.getByText("Ship the picker")).toBe(kept);
    expect(allLiveCards(ctx.getBoardDoc()).every((c) => !c.archived)).toBe(true);
  });

  it("still shows a hidden project's cards when it is the selected scope (AE3, R8)", () => {
    renderMain(seedWithHidden);
    act(() => setSelectedProject("plegacy-legacy"));

    expect(screen.getByText("Retire the cron")).toBeInTheDocument();
    expect(screen.getByText("Delete the shim")).toBeInTheDocument();
    expect(screen.queryByText("Ship the picker")).not.toBeInTheDocument();
    expect(screen.queryByText("Buy a domain")).not.toBeInTheDocument();
  });

  it("keeps unassigned cards when every project is hidden (R2)", () => {
    const { ctx } = renderMain(seedWithHidden);
    act(() => {
      execute(archiveProject, ctx, { projectId: "pweb" });
    });

    expect(screen.getByText("Buy a domain")).toBeInTheDocument();
    expect(screen.queryByText("Ship the picker")).not.toBeInTheDocument();
    expect(within(backlogHeader()).getByText("1")).toBeInTheDocument();
  });

  it("keeps the exclusion in the list and swimlane lenses (R1)", async () => {
    renderMain(seedWithHidden);

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByText("Ship the picker")).toBeInTheDocument();
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    fireEvent.click(screen.getByRole("button", { name: "Group by" }));
    const menu = await screen.findByRole("dialog", { name: "Group by menu" });
    fireEvent.click(within(menu).getByRole("button", { name: "Status" }));

    expect(screen.getByText("Ship the picker")).toBeInTheDocument();
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
  });

  it("changes nothing on a board with no hidden projects", () => {
    renderMain(seedBoard);
    for (const title of ["Ship the picker", "Retire the cron", "Delete the shim", "Buy a domain"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(within(backlogHeader()).getByText("4")).toBeInTheDocument();
  });

  it("still seeds a new card from the view filter while a project is hidden (AE7, R10)", async () => {
    const { ctx } = renderMain((ctx) => {
      seedWithHidden(ctx);
      execute(saveView, ctx, {
        view: {
          id: "v1",
          name: "Urgent only",
          filter: {
            op: "and",
            clauses: [{ field: "priority", condition: "is", values: [Priority.Urgent] }],
          },
        },
      });
    });

    // Apply the saved view, so `activeView.filter` carries a real seed clause.
    fireEvent.click(screen.getByRole("button", { name: "Views and filters" }));
    fireEvent.click(await screen.findByRole("button", { name: "Urgent only" }));

    // Create a card from the Backlog composer (header "+" is its first control).
    const backlog = screen.getByRole("region", {
      name: `Column: ${STATUS_META[Status.Backlog].name}`,
    });
    fireEvent.click(within(backlog).getAllByRole("button", { name: "Add card" })[0]!);
    const input = within(backlog).getByRole("textbox", { name: /new card title/i });
    fireEvent.change(input, { target: { value: "Fix the outage" } });
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    const created = allLiveCards(ctx.getBoardDoc()).find((c) => c.title === "Fix the outage");
    expect(created).toBeDefined();
    expect(getCard(ctx.getBoardDoc(), created!.id)?.priority).toBe(Priority.Urgent);
    // The exclusion clause must never leak into the seeds as a project.
    expect(created?.projectId).toBeUndefined();
  });
});
