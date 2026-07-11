// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { applyFocus, FOCUS_STORAGE_KEY, nextLevel, parseLevel, setFocusLevel } from "./focus-mode";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-focus");
});

describe("nextLevel", () => {
  it("cycles off → calm → zen → off", () => {
    expect(nextLevel("off")).toBe("calm");
    expect(nextLevel("calm")).toBe("zen");
    expect(nextLevel("zen")).toBe("off");
  });
});

describe("parseLevel", () => {
  it("accepts valid levels and falls back to off for anything else", () => {
    expect(parseLevel("calm")).toBe("calm");
    expect(parseLevel("zen")).toBe("zen");
    expect(parseLevel("off")).toBe("off");
    expect(parseLevel(null)).toBe("off");
    expect(parseLevel("bogus")).toBe("off");
  });
});

describe("applyFocus", () => {
  it("stamps data-focus for calm/zen and removes it for off", () => {
    applyFocus("calm");
    expect(document.documentElement.getAttribute("data-focus")).toBe("calm");

    applyFocus("zen");
    expect(document.documentElement.getAttribute("data-focus")).toBe("zen");

    applyFocus("off");
    expect(document.documentElement.hasAttribute("data-focus")).toBe(false);
  });
});

describe("setFocusLevel", () => {
  it("persists the choice and applies it (survives a reload via localStorage)", () => {
    setFocusLevel("calm");
    expect(localStorage.getItem(FOCUS_STORAGE_KEY)).toBe("calm");
    expect(document.documentElement.getAttribute("data-focus")).toBe("calm");

    setFocusLevel("off");
    expect(localStorage.getItem(FOCUS_STORAGE_KEY)).toBe("off");
    expect(document.documentElement.hasAttribute("data-focus")).toBe(false);
  });
});
