"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

// Shares the exact tokens as ContextMenu so the click-triggered menu is visually
// identical to the right-click menu. A positioned (non-context) menu exposes
// `data-side`, so add the directional slide-in the context menu omits.
const contentClass =
  "z-50 min-w-[11rem] overflow-hidden rounded-[var(--radius-md)] border border-line bg-popover p-1 text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4)] outline-none duration-[var(--dur-base)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1";

// Radix highlights items via `data-[highlighted]` (keyboard + pointer). Mirror
// the Command item look: accent left-rail + selected bg on highlight.
const itemBase =
  "relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)] border-l-2 border-l-transparent px-2 py-1.5 text-base outline-none data-[highlighted]:border-l-[var(--accent)] data-[highlighted]:bg-selected data-[highlighted]:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(contentClass, className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        itemBase,
        variant === "destructive" &&
          "text-[var(--danger)] data-[highlighted]:bg-[color-mix(in_oklab,var(--danger)_16%,transparent)] data-[highlighted]:text-[var(--danger)]",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(itemBase, "data-[state=open]:bg-selected", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-fg-faint" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent className={cn(contentClass, className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(itemBase, "pr-7", className)} {...props}>
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        "px-2 py-1 text-xs font-medium uppercase tracking-wide text-fg-faint",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  );
}
