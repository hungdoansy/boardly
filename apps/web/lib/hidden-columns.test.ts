// @vitest-environment jsdom
import { Status, STATUS_ORDER } from "@boardly/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HIDDEN_COLUMNS_STORAGE_KEY,
  getHiddenStatuses,
  parseHiddenStatuses,
  setColumnHidden,
  showAllColumns,
  subscribeHiddenColumns,
} from "./hidden-columns";

afterEach(() => {
  // The store is a module singleton, so clearing localStorage alone would leave
  // in-memory state leaking into the next test — reset through the real setter.
  showAllColumns();
  localStorage.clear();
});

const persisted = (): unknown => JSON.parse(localStorage.getItem(HIDDEN_COLUMNS_STORAGE_KEY) ?? "");

describe("parseHiddenStatuses", () => {
  it("reads a valid persisted array", () => {
    expect(parseHiddenStatuses('["backlog","duplicate"]')).toEqual([
      Status.Backlog,
      Status.Duplicate,
    ]);
  });

  it("returns empty for absent storage", () => {
    expect(parseHiddenStatuses(null)).toEqual([]);
  });

  it("returns empty for malformed JSON without throwing", () => {
    expect(() => parseHiddenStatuses("not json")).not.toThrow();
    expect(parseHiddenStatuses("not json")).toEqual([]);
  });

  it("returns empty for valid JSON that is not an array", () => {
    expect(parseHiddenStatuses('{"a":1}')).toEqual([]);
    expect(parseHiddenStatuses('"backlog"')).toEqual([]);
  });

  it("drops unknown and non-string members", () => {
    expect(parseHiddenStatuses('["todo","bogus",42,null]')).toEqual([Status.Todo]);
  });

  it("drops duplicates", () => {
    expect(parseHiddenStatuses('["todo","todo"]')).toEqual([Status.Todo]);
  });

  it("accepts all eight statuses — hiding everything is a legal persisted state", () => {
    expect(parseHiddenStatuses(JSON.stringify(STATUS_ORDER))).toEqual(STATUS_ORDER);
  });

  it("normalizes to STATUS_ORDER regardless of persisted order", () => {
    expect(parseHiddenStatuses('["duplicate","backlog"]')).toEqual([
      Status.Backlog,
      Status.Duplicate,
    ]);
  });
});

describe("hidden-columns store", () => {
  it("hides a status, exposes it, and persists it", () => {
    setColumnHidden(Status.Duplicate, true);
    expect(getHiddenStatuses()).toEqual([Status.Duplicate]);
    expect(persisted()).toEqual(["duplicate"]);
  });

  it("does not duplicate a status hidden twice", () => {
    setColumnHidden(Status.Duplicate, true);
    setColumnHidden(Status.Duplicate, true);
    expect(getHiddenStatuses()).toEqual([Status.Duplicate]);
  });

  it("unhides a status", () => {
    setColumnHidden(Status.Todo, true);
    setColumnHidden(Status.Backlog, true);
    setColumnHidden(Status.Todo, false);
    expect(getHiddenStatuses()).toEqual([Status.Backlog]);
    expect(persisted()).toEqual(["backlog"]);
  });

  it("unhiding an already-visible status is a no-op", () => {
    setColumnHidden(Status.Todo, true);
    const before = getHiddenStatuses();
    setColumnHidden(Status.Done, false);
    // Same contents, and the identity is stable so React does not re-render.
    expect(getHiddenStatuses()).toBe(before);
  });

  it("showAllColumns clears everything and persists an empty array", () => {
    setColumnHidden(Status.Todo, true);
    setColumnHidden(Status.Done, true);
    showAllColumns();
    expect(getHiddenStatuses()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it("keeps hidden statuses in STATUS_ORDER regardless of the order they were hidden", () => {
    setColumnHidden(Status.Duplicate, true);
    setColumnHidden(Status.Backlog, true);
    expect(getHiddenStatuses()).toEqual([Status.Backlog, Status.Duplicate]);
  });

  it("notifies subscribers on every mutation and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHiddenColumns(listener);

    setColumnHidden(Status.Todo, true);
    expect(listener).toHaveBeenCalledTimes(1);
    showAllColumns();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setColumnHidden(Status.Todo, true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns a stable snapshot reference between mutations", () => {
    // useSyncExternalStore loops forever if getSnapshot returns a fresh array.
    expect(getHiddenStatuses()).toBe(getHiddenStatuses());
    setColumnHidden(Status.Todo, true);
    const after = getHiddenStatuses();
    expect(after).toBe(getHiddenStatuses());
  });

  it("survives localStorage being unavailable", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(() => setColumnHidden(Status.Todo, true)).not.toThrow();
    // The in-memory state still updated, so the UI stays responsive.
    expect(getHiddenStatuses()).toEqual([Status.Todo]);

    setItem.mockRestore();
  });
});
