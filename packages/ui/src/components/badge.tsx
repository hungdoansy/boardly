import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/cn";

const badgeVariants = cva(
  "inline-flex h-[18px] items-center gap-1 rounded-[var(--radius-sm)] px-1.5 text-xs font-medium leading-none",
  {
    variants: {
      variant: {
        default: "bg-overlay text-fg-muted",
        accent: "bg-selected text-[var(--accent)]",
        success: "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-[var(--success)]",
        warning: "bg-[color-mix(in_oklab,var(--warning)_16%,transparent)] text-[var(--warning)]",
        danger: "bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] text-[var(--danger)]",
        outline: "border border-line text-fg-muted",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { badgeVariants };
