"use client";

import { useEffect, useRef } from "react";

import { isEditableTarget } from "./is-editable-target";
import { keyboardOwnedElsewhere } from "./keyboard-ownership";

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

export type LeaderResult<Id extends string = string> =
  /** Do nothing; the event is not the leader's concern (don't consume it). */
  | { next: LeaderState; action: "none" }
  /** `g` armed a sequence; consume the event. */
  | { next: LeaderState; action: "start" }
  /** Sequence cancelled (bad key / Escape / timeout); do NOT consume the event. */
  | { next: LeaderState; action: "cancel" }
  /** Sequence resolved to a binding; consume the event and run `id`. */
  | { next: LeaderState; action: "run"; id: Id };

/**
 * Pure leader-key transition. `registry` maps a follow-up key `code` to an
 * action id. See {@link LeaderResult} for which results consume the event.
 */
export function resolveLeader<Id extends string>(
  state: LeaderState,
  registry: Readonly<Record<string, Id>>,
  input: LeaderInput,
): LeaderResult<Id> {
  if (input.isTimeout) {
    return { next: "idle", action: state === "pending" ? "cancel" : "none" };
  }

  if (state === "pending") {
    // Re-check the arm-time guards on the *resolving* key too: a modifier chord,
    // a keystroke typed into a field, or an overlay/drag that grabbed the
    // keyboard during the arm window must cancel the sequence and pass the key
    // through — never be hijacked into running a binding (e.g. `g`, then click
    // into an input and type "p", or press ⌘P).
    if (input.hasModifier || input.editable || input.owned) {
      return { next: "idle", action: "cancel" };
    }
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
 * Install the leader-key mechanism. `registry` maps a follow-up key `code` to an
 * action id; `handlers` maps each id to its callback. The `Id` type ties the two
 * together at compile time — a registry value with no matching handler key (or a
 * typo in either) is a type error, not a silent runtime no-op. Both are read
 * from refs so the document listener is installed once and never churns.
 */
export function useLeaderHotkeys<Id extends string>(
  registry: Readonly<Record<string, Id>>,
  handlers: Readonly<Record<Id, () => void>>,
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
        owned: keyboardOwnedElsewhere(),
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
        default: {
          // Exhaustiveness guard: a new LeaderResult variant becomes a type error.
          const _exhaustive: never = result;
          return _exhaustive;
        }
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
