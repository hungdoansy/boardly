"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { useSyncExternalStore } from "react";

import { cn } from "../lib/cn";

// A deliberately tiny toast surface: a module-level store (mirrors the
// `useSyncExternalStore` idiom in the app's theme/focus stores) plus a single
// <Toaster/> mounted once at the app root. `toast(message)` can fire from
// anywhere — React or a plain event handler — with no provider prop-drilling.
// Scope for now: one short, auto-dismissing confirmation line (e.g. "copied").

export interface ToastItem {
  id: number;
  message: string;
}

let toasts: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Show a short, auto-dismissing confirmation toast. */
export function toast(message: string): void {
  seq += 1;
  toasts = [...toasts, { id: seq, message }];
  emit();
}

function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const EMPTY: ToastItem[] = [];

/**
 * Mount once, outside the focus-scoped `<main>` (its viewport is `position:
 * fixed`, so keep it clear of the Calm/Zen `filter` containing block). Reads the
 * store and renders one Radix toast per queued message.
 */
export function Toaster({ duration = 2500 }: { duration?: number }) {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );

  return (
    <ToastPrimitive.Provider duration={duration} swipeDirection="right">
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id);
          }}
          className={cn(
            "flex items-center gap-2 rounded-[var(--radius-md)] border border-line bg-elevated px-3 py-2 text-sm text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4)] outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-[var(--dur-base)]",
          )}
        >
          <ToastPrimitive.Title>{t.message}</ToastPrimitive.Title>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
