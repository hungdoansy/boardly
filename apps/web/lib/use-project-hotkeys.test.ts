import { describe, expect, it } from "vitest";

import { projectBadge, resolveProjectHotkey } from "./use-project-hotkeys";

describe("resolveProjectHotkey", () => {
  it("maps Digit1 to All regardless of project count", () => {
    expect(resolveProjectHotkey("Digit1", 0)).toEqual({ kind: "all" });
    expect(resolveProjectHotkey("Digit1", 9)).toEqual({ kind: "all" });
  });

  it("maps Digit2…5 to the first four projects (All takes slot 1)", () => {
    expect(resolveProjectHotkey("Digit2", 4)).toEqual({ kind: "select", index: 0 });
    expect(resolveProjectHotkey("Digit3", 4)).toEqual({ kind: "select", index: 1 });
    expect(resolveProjectHotkey("Digit5", 4)).toEqual({ kind: "select", index: 3 });
  });

  it("no-ops for a project slot past the visible count", () => {
    expect(resolveProjectHotkey("Digit3", 1)).toBeNull(); // wants project index 1, only 1 project
    expect(resolveProjectHotkey("Digit2", 0)).toBeNull();
  });

  it("maps Digit6 to the switcher regardless of project count", () => {
    expect(resolveProjectHotkey("Digit6", 0)).toEqual({ kind: "switcher" });
    expect(resolveProjectHotkey("Digit6", 12)).toEqual({ kind: "switcher" });
  });

  it("ignores non-digit and out-of-range keys", () => {
    expect(resolveProjectHotkey("Digit7", 10)).toBeNull();
    expect(resolveProjectHotkey("KeyP", 10)).toBeNull();
    expect(resolveProjectHotkey("Digit0", 10)).toBeNull();
  });
});

describe("projectBadge", () => {
  it("numbers the first four projects 2…5 (All is 1)", () => {
    expect(projectBadge(0)).toBe(2);
    expect(projectBadge(3)).toBe(5);
  });

  it("returns null past the numbered range", () => {
    expect(projectBadge(4)).toBeNull();
    expect(projectBadge(10)).toBeNull();
  });
});
