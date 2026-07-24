"use client";

import { useEffect, useRef } from "react";

import { isEditableTarget } from "./is-editable-target";

/**
 * Leader-key ("g" then …) hotkey mechanism, Linear-style.
 *
 * Pressing `g` (with no modifier, not while typing, not while an overlay/drag
 * owns the keyboard) arms a *pending* sequence; the next key resolves a `g`+key
 * binding from the registry, or cancels. The pure {@link resolveLeader} reducer
 * owns every transition and is unit-tested without a DOM; the hook only wires
 * the listener, the timeout, and the DOM adapters (mirroring the pure/adapter
 * split in `keyboard-nav.tsx`).
 *
 * The listener runs in the **capture phase** so it sees the resolving key
 * *before* the board-root bubble listener, and calls `stopPropagation()` +
 * `preventDefault()` when it consumes a key. That is what lets `g` `p` open the
 * project switcher even while a card is focused, without the board also acting
 * on the `p` (cycle priority) or `c` (open composer).
 */

/** The physical key that starts a leader sequence (`e.code`, layout-independent). */
export const LEADER_CODE = "KeyG";

/** How long an armed sequence waits for its second key before cancelling. */
export const LEADER_TIMEOUT_MS = 1500;

export type LeaderState = "idle" | "pending";

/** A single keydown (or a timeout tick) reduced against the leader state. */
export interface LeaderInput {
  /** Physical key code (`e.code`), e.g. "KeyG", "KeyP". */
  code: string;
  /** Any of ⌘/Ctrl/Alt held — leader never arms or resolves under a modifier. */
  hasModifier: boolean;
  /** Target is a text field — typing "g" must never arm the leader. */
  editable: boolean;
  /** An open dialog/palette or an active dnd keyboard drag owns the keyboard. */
  owned: boolean;
  /** The key is Escape (cancels a pending sequence). */
  isEscape: boolean;
  /** This is the timeout tick, not a real keydown. */
  isTimeout: boolean;
}

export type LeaderResult =
  /** Do nothing; the event is not the leader's concern (don't consume it). */
  | { next: LeaderState; action: "none" }
  /** `g` armed a sequence; consume the event. */
  | { next: LeaderState; action: "start" }
  /** Sequence cancelled (bad key / Escape / timeout); do NOT consume the event. */
  | { next: LeaderState; action: "cancel" }
  /** Sequence resolved to a binding; consume the event and run `id`. */
  | { next: LeaderState; action: "run"; id: string };

/**
 * Pure leader-key transition. `registry` maps a follow-up key `code` to an
 * action id. See {@link LeaderResult} for which results consume the event.
 */
export function resolveLeader(
  state: LeaderState,
  registry: Readonly<Record<string, string>>,
  input: LeaderInput,
): LeaderResult {
  if (input.isTimeout) {
    return { next: "idle", action: state === "pending" ? "cancel" : "none" };
  }

  if (state === "pending") {
    if (input.isEscape) return { next: "idle", action: "cancel" };
    const id = registry[input.code];
    if (id) return { next: "idle", action: "run", id };
    // Any other key ends the sequence and passes through unconsumed.
    return { next: "idle", action: "cancel" };
  }

  // idle: only a bare `g` (no modifier, not typing, nothing else owns keys) arms.
  if (input.hasModifier || input.editable || input.owned) {
    return { next: "idle", action: "none" };
  }
  if (input.code === LEADER_CODE) return { next: "pending", action: "start" };
  return { next: "idle", action: "none" };
}

/**
 * Whether an open dialog/palette or an active dnd keyboard drag currently owns
 * the keyboard, so the leader should not arm. Mirrors `escIsOwnedElsewhere` in
 * `workspace-app.tsx`: the drag guard targets `[data-nav="card"][aria-pressed]`
 * specifically — a bare `aria-pressed` check would false-positive on sidebar
 * toggles (selected project row, Settings).
 */
function leaderOwnedElsewhere(): boolean {
  if (typeof document === "undefined") return false;
  if (document.querySelector('[data-nav="card"][aria-pressed="true"]')) return true;
  if (document.querySelector('[role="dialog"][data-state="open"]')) return true;
  return false;
}

/**
 * Install the leader-key mechanism. `registry` maps a follow-up key `code` to an
 * action id; `handlers` maps each id to its callback. Both are read from refs so
 * the document listener is installed once and never churns.
 */
export function useLeaderHotkeys(
  registry: Readonly<Record<string, string>>,
  handlers: Readonly<Record<string, () => void>>,
): void {
  const registryRef = useRef(registry);
  const handlersRef = useRef(handlers);
  registryRef.current = registry;
  handlersRef.current = handlers;

  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearPending = (): void => {
      pending = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      const result = resolveLeader(pending ? "pending" : "idle", registryRef.current, {
        code: e.code,
        hasModifier: e.metaKey || e.ctrlKey || e.altKey,
        editable: isEditableTarget(e.target),
        owned: leaderOwnedElsewhere(),
        isEscape: e.key === "Escape",
        isTimeout: false,
      });

      switch (result.action) {
        case "start":
          pending = true;
          e.preventDefault();
          e.stopPropagation();
          timer = setTimeout(() => {
            pending = false;
            timer = undefined;
          }, LEADER_TIMEOUT_MS);
          return;
        case "run":
          clearPending();
          e.preventDefault();
          e.stopPropagation();
          handlersRef.current[result.id]?.();
          return;
        case "cancel":
          // End the sequence but let the key do its normal thing (do not consume).
          clearPending();
          return;
        case "none":
          return;
      }
    };

    // Capture phase: intercept before the board-root bubble listener.
    document.addEventListener("keydown", onKeyDown, true);
    // A window blur (tab switch, devtools) must not leave a sequence armed.
    const onBlur = (): void => clearPending();
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
      clearPending();
    };
  }, []);
}
