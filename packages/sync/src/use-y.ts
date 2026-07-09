"use client";

// React binding for Yjs built on useSyncExternalStore. `useY` subscribes to a
// single Y type (scoped — observing a card's map, not the whole board) and
// recomputes a selector on change. The snapshot is cached and only replaced
// when the selector's result actually differs (Object.is by default, or a
// supplied comparator), so:
//   - unrelated changes to other Y types never re-render this component;
//   - returning a fresh array/object from the selector doesn't loop
//     useSyncExternalStore (the cached reference stays stable between changes).
import { useCallback, useRef, useSyncExternalStore } from "react";

/** Structural view of the Yjs observe API shared by Y.Map / Y.Array / Y.Text. */
export interface YObservable {
  observe(fn: (...args: unknown[]) => void): void;
  unobserve(fn: (...args: unknown[]) => void): void;
  observeDeep(fn: (...args: unknown[]) => void): void;
  unobserveDeep(fn: (...args: unknown[]) => void): void;
}

export interface UseYOptions<T> {
  /** Observe nested changes (observeDeep) instead of only direct ones. */
  deep?: boolean;
  /** Equality check to decide whether a change should re-render. */
  isEqual?: (a: T, b: T) => boolean;
}

export function useY<T>(target: YObservable, selector: () => T, options: UseYOptions<T> = {}): T {
  const { deep = false, isEqual } = options;

  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const cache = useRef<{ value: T } | null>(null);

  const getSnapshot = useCallback((): T => {
    if (cache.current === null) {
      cache.current = { value: selectorRef.current() };
    }
    return cache.current.value;
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      const handler = (): void => {
        const next = selectorRef.current();
        const prev = cache.current?.value;
        const equal =
          prev !== undefined && isEqualRef.current
            ? isEqualRef.current(prev, next)
            : Object.is(prev, next);
        if (!equal) {
          cache.current = { value: next };
          onStoreChange();
        }
      };
      if (deep) {
        target.observeDeep(handler);
        return () => target.unobserveDeep(handler);
      }
      target.observe(handler);
      return () => target.unobserve(handler);
    },
    [target, deep],
  );

  // Same function for client + server snapshot (SSR renders the initial value).
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
