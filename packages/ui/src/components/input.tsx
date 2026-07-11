import type * as React from "react";

import { cn } from "../lib/cn";

// React 19: `ref` is passed as a normal prop (no forwardRef needed).
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

/**
 * Base text input — shared focus/hover/disabled states so drawer forms read
 * consistently. Border (in-box) rather than an outset ring so it never clips
 * inside an `overflow` container.
 */
export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-7 w-full min-w-0 rounded-[var(--radius-sm)] border border-line bg-elevated px-2 text-sm text-fg outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)] placeholder:text-fg-faint hover:border-line-strong focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
