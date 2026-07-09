// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { useY } from "./use-y";

describe("useY", () => {
  it("re-renders on observed changes but not on unrelated ones", () => {
    const doc = new Y.Doc();
    const cards = doc.getMap<Y.Map<unknown>>("cards");
    const cardA = new Y.Map<unknown>();
    const cardB = new Y.Map<unknown>();
    doc.transact(() => {
      cardA.set("title", "A");
      cardB.set("title", "B");
      cards.set("a", cardA);
      cards.set("b", cardB);
    });

    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useY(cardA, () => cardA.get("title") as string);
    });

    expect(result.current).toBe("A");
    const baseline = renders;

    // Unrelated change (a different card) → no re-render.
    act(() => {
      cardB.set("title", "B2");
    });
    expect(renders).toBe(baseline);
    expect(result.current).toBe("A");

    // Observed change → re-render with the new value.
    act(() => {
      cardA.set("title", "A2");
    });
    expect(result.current).toBe("A2");
    expect(renders).toBeGreaterThan(baseline);
  });

  it("keeps a stable snapshot reference between changes (no render loop)", () => {
    const doc = new Y.Doc();
    const list = doc.getArray<string>("list");
    doc.transact(() => list.push(["x"]));

    const { result, rerender } = renderHook(() => useY(list, () => list.toArray()));
    const first = result.current;
    rerender();
    // Same reference across renders when nothing changed.
    expect(result.current).toBe(first);
  });
});
