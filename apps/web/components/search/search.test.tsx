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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
});
