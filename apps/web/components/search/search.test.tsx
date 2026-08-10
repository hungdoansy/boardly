// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import {
  archiveProject,
  createCard,
  createMemoryContext,
  createProject,
  execute,
  type MemoryContext,
} from "@boardly/commands";
import { initBoard } from "@boardly/sync";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { recentDocs, type SearchDoc, searchDocs } from "./search-index";
import { SearchDialog } from "./search";
import { useSearchDocs } from "./use-search";

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  cardId: "id",
  boardTitle: "Board",
  title: "",
  description: "",
  shortId: "BRD-0",
  labels: [],
  projectHidden: false,
  updatedAt: 0,
  ...over,
});

describe("searchDocs (pure ranking)", () => {
  const docs = [
    doc({ cardId: "1", title: "Auth service", shortId: "BRD-1", updatedAt: 3 }),
    doc({ cardId: "2", title: "Authenticate the user", shortId: "BRD-2", updatedAt: 2 }),
    doc({
      cardId: "3",
      title: "Redesign landing",
      shortId: "BRD-42",
      labels: ["bug"],
      updatedAt: 1,
    }),
    doc({ cardId: "4", title: "Nothing relevant", description: "auth lives here", updatedAt: 4 }),
  ];

  it("returns nothing for an empty query", () => {
    expect(searchDocs(docs, "")).toEqual([]);
    expect(searchDocs(docs, "   ")).toEqual([]);
  });

  it("matches by title and ranks a prefix hit above a scattered one", () => {
    const ids = searchDocs(docs, "auth").map((r) => r.doc.cardId);
    expect(ids[0]).toBe("1"); // "Auth service" — prefix
    expect(ids).toContain("2"); // "Authenticate…"
    expect(ids).toContain("4"); // only in description → ranked lowest of the matches
    expect(ids.indexOf("4")).toBeGreaterThan(ids.indexOf("1"));
  });

  it("matches by short id and by label", () => {
    expect(searchDocs(docs, "BRD-42").map((r) => r.doc.cardId)).toEqual(["3"]);
    expect(searchDocs(docs, "bug").map((r) => r.doc.cardId)).toEqual(["3"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchDocs(docs, "zzzznope")).toEqual([]);
  });

  it("never ranks on project context — it is display-only (UNIT-20, KTD6)", () => {
    // Project name carries no FIELD_WEIGHT on purpose: giving it one would move
    // every existing result's score. A card matches only on its own fields.
    const scoped = [doc({ cardId: "5", title: "Unrelated", projectName: "Auth platform" })];
    expect(searchDocs(scoped, "auth")).toEqual([]);
  });

  it("recentDocs orders by updatedAt desc", () => {
    expect(recentDocs(docs, 2).map((d) => d.cardId)).toEqual(["4", "1"]);
  });
});

// ---------------------------------------------------------------------------

function seed() {
  const ctx = createMemoryContextWithSeed();
  render(
    <BoardlyProvider context={ctx.ctx}>
      <SearchDialog open onOpenChange={() => {}} />
    </BoardlyProvider>,
  );
  return ctx;
}

function createMemoryContextWithSeed() {
  const ctx = createMemoryContext();
  initBoard(ctx.getBoardDoc(), { title: "Roadmap", now: 0 });
  const a = execute(createCard, ctx, { title: "Auth service" });
  execute(createCard, ctx, { title: "Redesign landing" });
  return { ctx, cardA: a!.id };
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => cleanup());

/**
 * Both search surfaces read this one hook, so the hidden-project rule and the
 * project context a marker needs are asserted here once rather than twice over
 * the two very different ranking paths above it.
 */
describe("useSearchDocs project context (UNIT-20)", () => {
  /** Web (visible), Legacy (hidden), and one unassigned card. */
  function seedProjects(): MemoryContext {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Roadmap", now: 0 });
    execute(createProject, ctx, { id: "pweb", name: "Web" });
    execute(createProject, ctx, { id: "plegacy", name: "Legacy" });
    execute(createCard, ctx, { title: "Ship the picker", projectId: "pweb" });
    execute(createCard, ctx, { title: "Retire the cron", projectId: "plegacy" });
    execute(createCard, ctx, { title: "Buy a domain" });
    return ctx;
  }

  function renderDocs(ctx: MemoryContext, options?: { includeHidden?: boolean }) {
    return renderHook(() => useSearchDocs(options), {
      wrapper: ({ children }) => <BoardlyProvider context={ctx}>{children}</BoardlyProvider>,
    });
  }

  const titles = (docs: SearchDoc[]): string[] => docs.map((d) => d.title);
  const byTitle = (docs: SearchDoc[], title: string): SearchDoc | undefined =>
    docs.find((d) => d.title === title);

  it("omits a hidden project's cards by default (R4)", () => {
    const ctx = seedProjects();
    execute(archiveProject, ctx, { projectId: "plegacy" });

    expect(titles(renderDocs(ctx).result.current)).toEqual(["Ship the picker", "Buy a domain"]);
  });

  it("includes them when asked, named and marked hidden (R7)", () => {
    const ctx = seedProjects();
    execute(archiveProject, ctx, { projectId: "plegacy" });

    const hit = byTitle(renderDocs(ctx, { includeHidden: true }).result.current, "Retire the cron");
    // The name resolves from the archived list — `listProjects` alone would leave
    // the marker on exactly these cards nameless.
    expect(hit).toMatchObject({
      projectId: "plegacy",
      projectName: "Legacy",
      projectHidden: true,
    });
  });

  it("resolves a visible project's name and leaves it unmarked", () => {
    const hit = byTitle(renderDocs(seedProjects()).result.current, "Ship the picker");
    expect(hit).toMatchObject({
      projectId: "pweb",
      projectName: "Web",
      projectHidden: false,
    });
  });

  it("keeps an unassigned card under both options, with no project context (R2)", () => {
    const ctx = seedProjects();
    execute(archiveProject, ctx, { projectId: "plegacy" });

    for (const options of [undefined, { includeHidden: true }]) {
      const hit = byTitle(renderDocs(ctx, options).result.current, "Buy a domain");
      expect(hit?.projectId).toBeUndefined();
      expect(hit?.projectName).toBeUndefined();
      expect(hit?.projectHidden).toBe(false);
      cleanup();
    }
  });

  it("drops a project's cards the moment it is hidden (the index is live)", () => {
    const ctx = seedProjects();
    const { result } = renderDocs(ctx);
    expect(titles(result.current)).toContain("Retire the cron");

    act(() => {
      execute(archiveProject, ctx, { projectId: "plegacy" });
    });

    expect(titles(result.current)).not.toContain("Retire the cron");
  });
});

describe("SearchDialog", () => {
  it("shows recents when the query is empty", () => {
    seed();
    // Both seeded cards appear under Recent (no query typed).
    expect(screen.getByText("Auth service")).toBeInTheDocument();
    expect(screen.getByText("Redesign landing")).toBeInTheDocument();
  });

  it("filters to matching cards and deep-links on select", async () => {
    seed();
    fireEvent.change(screen.getByPlaceholderText(/search cards/i), { target: { value: "auth" } });

    const hit = await screen.findByText("Auth service");
    expect(screen.queryByText("Redesign landing")).not.toBeInTheDocument();

    fireEvent.click(hit);
    // Linear-style ticket hash: first card → number 1, empty prefix → "#1-<slug>".
    expect(window.location.hash).toBe("#1-auth-service");
  });

  it("shows an empty state when nothing matches", async () => {
    seed();
    fireEvent.change(screen.getByPlaceholderText(/search cards/i), {
      target: { value: "zzzznope" },
    });
    expect(await screen.findByText("No matching cards.")).toBeInTheDocument();
  });

  it("offers no include-hidden toggle on a board with no hidden projects", () => {
    seed();
    expect(
      screen.queryByRole("option", { name: /include hidden projects/i }),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

const searchInput = () => screen.getByPlaceholderText(/search cards/i);
const typeSearch = (value: string) => fireEvent.change(searchInput(), { target: { value } });
const hiddenToggle = () => screen.getByRole("option", { name: /include hidden projects/i });

/** Every rendered result row, top-ranked first, with the toggle row dropped. */
const resultRows = async (): Promise<string[]> =>
  (await screen.findAllByRole("option"))
    .map((row) => row.textContent ?? "")
    .filter((text) => !text.includes("Include hidden projects"));

/**
 * The `/` dialog reaches the same rule as ⌘K down a different road: it ranks
 * with `scoreDoc` under `shouldFilter={false}`, and its open state is owned by
 * `workspace-app`. So each guard below exercises a mechanism the palette's twin
 * assertion does not, even where the two read alike.
 */
describe("SearchDialog — hidden projects (UNIT-20)", () => {
  /** Web (visible) and Legacy (hidden) with a card each, plus one unassigned. */
  function seedHidden(): MemoryContext {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Roadmap", now: 0 });
    execute(createProject, ctx, { id: "pweb", name: "Web" });
    execute(createProject, ctx, { id: "plegacy", name: "Legacy" });
    execute(createCard, ctx, { title: "Ship the picker", projectId: "pweb" });
    execute(createCard, ctx, { title: "Retire the cron", projectId: "plegacy" });
    execute(createCard, ctx, { title: "Buy a domain" });
    execute(archiveProject, ctx, { projectId: "plegacy" });
    return ctx;
  }

  /** Three visible cards "auth" scores apart, plus one behind a hidden project. */
  function seedRanking(): MemoryContext {
    const ctx = createMemoryContext();
    initBoard(ctx.getBoardDoc(), { title: "Roadmap", now: 0 });
    execute(createProject, ctx, { id: "plegacy", name: "Legacy" });
    execute(createCard, ctx, { title: "Auth service" }); // prefix hit
    execute(createCard, ctx, { title: "Refresh auth token" }); // word-boundary hit
    execute(createCard, ctx, { title: "Cauterize truth" }); // scattered subsequence
    execute(createCard, ctx, { title: "Auth cleanup", projectId: "plegacy" });
    execute(archiveProject, ctx, { projectId: "plegacy" });
    return ctx;
  }

  /**
   * The dialog's `open` belongs to the parent, so reopening is a prop round-trip
   * rather than a click — which is exactly the transition the per-open reset has
   * to survive.
   */
  function renderDialog(ctx: MemoryContext) {
    const onOpenChange = vi.fn();
    const tree = (open: boolean) => (
      <BoardlyProvider context={ctx}>
        <SearchDialog open={open} onOpenChange={onOpenChange} />
      </BoardlyProvider>
    );
    const { rerender } = render(tree(true));
    return {
      onOpenChange,
      reopen: (): void => {
        rerender(tree(false));
        rerender(tree(true));
      },
    };
  }

  it("leaves a hidden project's cards out of both recents and results (R4)", async () => {
    renderDialog(seedHidden());
    expect(screen.getByText("Ship the picker")).toBeInTheDocument();
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();

    typeSearch("retire");
    expect(await screen.findByText("No matching cards.")).toBeInTheDocument();
  });

  it("reveals the card, marked with its project, when the toggle is on (R5, R7)", async () => {
    renderDialog(seedHidden());
    typeSearch("retire");
    expect(await screen.findByText("No matching cards.")).toBeInTheDocument();

    fireEvent.click(hiddenToggle());

    const row = await screen.findByRole("option", { name: /retire the cron/i });
    expect(row).toHaveTextContent("Legacy");
    // The glyph alone would encode the distinction visually (DESIGN.md §9).
    expect(row).toHaveTextContent("Hidden project");
  });

  it("keeps the empty state reachable with the toggle row on screen", async () => {
    renderDialog(seedHidden());
    typeSearch("zzzznope");

    // This surface sets `shouldFilter={false}`, where cmdk equates
    // `filtered.count` with the number of *registered* items and `CommandEmpty`
    // renders only at zero. An ordinary toggle row would pin the count at one
    // and suppress "No matching cards." forever; force-mounting keeps the row
    // out of the registry.
    expect(await screen.findByText("No matching cards.")).toBeInTheDocument();
    expect(hiddenToggle()).toBeInTheDocument();
  });

  it("resets both the toggle and the query when the dialog is reopened (R6)", async () => {
    const { reopen } = renderDialog(seedHidden());
    fireEvent.click(hiddenToggle());
    typeSearch("retire");
    expect(await screen.findByText("Retire the cron")).toBeInTheDocument();

    reopen();

    // Both resets ride on the same mechanism: Radix unmounts the dialog's
    // content on close, so the state simply does not survive to the next open.
    expect(searchInput()).toHaveValue("");
    expect(hiddenToggle()).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText("Retire the cron")).not.toBeInTheDocument();
  });

  it("exposes the toggle as a checkable option, reachable and flippable by keyboard", () => {
    const { onOpenChange } = renderDialog(seedHidden());
    expect(hiddenToggle()).toHaveAttribute("aria-checked", "false");

    // Arrow navigation walks cmdk's DOM item list, which a force-mounted row
    // joins even though it never enters the filter registry.
    for (let i = 0; i < 12 && hiddenToggle().getAttribute("data-selected") !== "true"; i++) {
      fireEvent.keyDown(searchInput(), { key: "ArrowDown" });
    }
    expect(hiddenToggle()).toHaveAttribute("data-selected", "true");

    fireEvent.keyDown(searchInput(), { key: "Enter" });
    expect(hiddenToggle()).toHaveAttribute("aria-checked", "true");
    // Flipping the switch must not close the dialog — the results it reveals
    // are the whole point.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("ranks visible-project results exactly as it did before the toggle existed", async () => {
    renderDialog(seedRanking());
    typeSearch("auth");

    const rows = await resultRows();
    expect(rows[0]).toContain("Auth service");
    expect(rows[1]).toContain("Refresh auth token");
    expect(rows[2]).toContain("Cauterize truth");
    expect(rows.join(" ")).not.toContain("Auth cleanup");
  });

  it("still opens the top-ranked result on Enter", async () => {
    renderDialog(seedRanking());
    typeSearch("auth");
    await screen.findByText("Auth service");

    // The toggle row must not steal cmdk's auto-selection from the first
    // result: typing then pressing Enter is this surface's primary path.
    fireEvent.keyDown(searchInput(), { key: "Enter" });
    expect(window.location.hash).toBe("#1-auth-service");
  });
});
