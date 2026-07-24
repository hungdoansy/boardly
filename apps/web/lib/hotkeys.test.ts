import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isEditableTarget } from "./is-editable-target";
import { type LeaderInput, type LeaderState, resolveLeader, useLeaderHotkeys } from "./hotkeys";

const REGISTRY = { KeyP: "project-switcher" } as const;

/** A plain, non-owned, non-modified keydown of `code`, overridable per case. */
function input(code: string, over: Partial<LeaderInput> = {}): LeaderInput {
  return {
    code,
    hasModifier: false,
    editable: false,
    owned: false,
    isEscape: false,
    isTimeout: false,
    ...over,
  };
}

function resolve(state: LeaderState, over: Partial<LeaderInput> & { code?: string } = {}) {
  return resolveLeader(state, REGISTRY, input(over.code ?? "KeyG", over));
}

describe("resolveLeader — arming", () => {
  it("bare `g` while idle arms the sequence and consumes the event", () => {
    expect(resolve("idle", { code: "KeyG" })).toEqual({ next: "pending", action: "start" });
  });

  it("a non-leader key while idle is left alone", () => {
    expect(resolve("idle", { code: "KeyP" })).toEqual({ next: "idle", action: "none" });
  });

  it("`g` while a modifier is held does not arm (⌘-chords pass through)", () => {
    expect(resolve("idle", { code: "KeyG", hasModifier: true })).toEqual({
      next: "idle",
      action: "none",
    });
  });

  it("`g` while typing in a field does not arm", () => {
    expect(resolve("idle", { code: "KeyG", editable: true })).toEqual({
      next: "idle",
      action: "none",
    });
  });

  it("`g` while a dialog/drag owns the keyboard does not arm", () => {
    expect(resolve("idle", { code: "KeyG", owned: true })).toEqual({
      next: "idle",
      action: "none",
    });
  });
});

describe("resolveLeader — resolving", () => {
  it("`p` after `g` runs the registered action and consumes the event", () => {
    expect(resolve("pending", { code: "KeyP" })).toEqual({
      next: "idle",
      action: "run",
      id: "project-switcher",
    });
  });

  it("an unregistered key after `g` cancels and passes through", () => {
    expect(resolve("pending", { code: "KeyZ" })).toEqual({ next: "idle", action: "cancel" });
  });

  it("Escape after `g` cancels", () => {
    expect(resolve("pending", { code: "Escape", isEscape: true })).toEqual({
      next: "idle",
      action: "cancel",
    });
  });

  it("timeout while pending cancels", () => {
    expect(resolve("pending", { isTimeout: true })).toEqual({ next: "idle", action: "cancel" });
  });

  it("timeout while idle is a no-op", () => {
    expect(resolve("idle", { isTimeout: true })).toEqual({ next: "idle", action: "none" });
  });
});

describe("isEditableTarget", () => {
  it.each(["input", "textarea", "select"])("treats <%s> as editable", (tag) => {
    const el = document.createElement(tag);
    expect(isEditableTarget(el)).toBe(true);
  });

  it("treats a contentEditable element as editable", () => {
    const el = document.createElement("div");
    el.contentEditable = "true";
    // jsdom does not derive isContentEditable from the attribute; assert directly.
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isEditableTarget(el)).toBe(true);
  });

  it("treats a plain element and null as not editable", () => {
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("useLeaderHotkeys (hook)", () => {
  afterEach(() => cleanup());

  function setup() {
    const run = vi.fn();
    renderHook(() => useLeaderHotkeys({ KeyP: "go" }, { go: run }));
    return { run };
  }

  function press(code: string, target: EventTarget = document, init: KeyboardEventInit = {}): void {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init }),
      );
    });
  }

  it("`g` then `p` runs the registered handler", () => {
    const { run } = setup();
    press("KeyG");
    press("KeyP");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("`p` alone does nothing (not part of a sequence)", () => {
    const { run } = setup();
    press("KeyP");
    expect(run).not.toHaveBeenCalled();
  });

  it("`g` then an unregistered key cancels the sequence", () => {
    const { run } = setup();
    press("KeyG");
    press("KeyZ");
    press("KeyP"); // fresh `p` is not a sequence
    expect(run).not.toHaveBeenCalled();
  });

  it("does not arm while typing in a field", () => {
    const { run } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("KeyG", input);
    press("KeyP", input);
    expect(run).not.toHaveBeenCalled();
    input.remove();
  });

  it("consumes the sequence keys in the capture phase so a bubble listener never sees them", () => {
    const { run } = setup();
    const child = document.createElement("div");
    document.body.appendChild(child);
    const bubbleSpy = vi.fn();
    child.addEventListener("keydown", bubbleSpy); // bubble-phase, like the board root

    press("KeyG", child);
    press("KeyP", child);
    expect(run).toHaveBeenCalledTimes(1);
    expect(bubbleSpy).not.toHaveBeenCalled(); // capture stopPropagation shielded the board

    // A non-sequence key still reaches the bubble listener untouched.
    press("KeyZ", child);
    expect(bubbleSpy).toHaveBeenCalledTimes(1);
    child.remove();
  });
});
