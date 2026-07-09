import { describe, expect, it } from "vitest";

// Proves the UI test project runs under jsdom with fake-indexeddb installed
// by the shared setup — the environment later UI + Yjs tests depend on.
describe("ui test environment", () => {
  it("runs under jsdom (DOM globals available)", () => {
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
  });

  it("has fake-indexeddb installed (indexedDB global available)", () => {
    expect(indexedDB).toBeDefined();
  });
});
