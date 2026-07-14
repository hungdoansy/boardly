"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { Check, ChevronRight } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;
export const ContextMenuSub = ContextMenuPrimitive.Sub;

const contentClass =
  "z-50 min-w-[11rem] overflow-hidden rounded-[var(--radius-md)] border border-line bg-popover p-1 text-fg shadow-[0_8px_24px_rgba(0,0,0,0.4)] outline-none duration-[var(--dur-base)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95";

// Radix highlights items via `data-[highlighted]` (keyboard + pointer). Mirror
// the Command item look: accent left-rail + selected bg on highlight.
const itemBase =
  "relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)] border-l-2 border-l-transparent px-2 py-1.5 text-[13px] outline-none data-[highlighted]:border-l-[var(--accent)] data-[highlighted]:bg-selected data-[highlighted]:text-fg data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content className={cn(contentClass, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
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

export function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(itemBase, "data-[state=open]:bg-selected", className)}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-3.5 text-fg-faint" aria-hidden="true" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent className={cn(contentClass, className)} {...props} />
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem className={cn(itemBase, "pr-7", className)} {...props}>
      {children}
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="size-3.5 text-[var(--accent)]" aria-hidden="true" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
    </ContextMenuPrimitive.RadioItem>
  );
}

export function ContextMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      className={cn("px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-fg-faint", className)}
      {...props}
    />
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />
  );
}
