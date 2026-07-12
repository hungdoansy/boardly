// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { addColumn, createCard, createMemoryContext, execute } from "@boardly/commands";
import { initBoard } from "@boardly/sync";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoardlyProvider } from "../../lib/boardly-context";
import { recentDocs, type SearchDoc, searchDocs } from "./search-index";
import { SearchDialog } from "./search";

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  cardId: "id",
  boardTitle: "Board",
  title: "",
  description: "",
  shortId: "BRD-0",
  labels: [],
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
  const col = execute(addColumn, ctx, { title: "To Do" });
  const a = execute(createCard, ctx, { columnId: col.id, title: "Auth service" });
  execute(createCard, ctx, { columnId: col.id, title: "Redesign landing" });
  return { ctx, cardA: a!.id };
}

beforeEach(() => {
  window.location.hash = "";
});
afterEach(() => cleanup());

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
