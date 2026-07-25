"use client";

import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type * as React from "react";

import { cn } from "../lib/cn";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-md)] bg-popover text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function CommandDialog({
  children,
  title = "Command palette",
  shouldFilter,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  /** Accessible dialog name (screen-reader only). */
  title?: string;
  /** Forwarded to cmdk; pass `false` to rank results yourself (e.g. search). */
  shouldFilter?: boolean;
  /** Radix close-focus-restore hook; forwarded to the underlying dialog content
   * (e.g. `preventDefault()` it when chaining straight into another dialog). */
  onCloseAutoFocus?: React.ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
}) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command
          shouldFilter={shouldFilter}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-fg-faint [&_[cmdk-input-wrapper]]:h-11"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-3" cmdk-input-wrapper="">
      <Search className="size-4 shrink-0 text-fg-faint" />
      <CommandPrimitive.Input
        className={cn(
          "flex h-10 w-full bg-transparent py-3 text-base outline-none placeholder:text-fg-faint disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn("max-h-80 overflow-y-auto overflow-x-hidden p-1", className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-6 text-center text-sm text-fg-muted" {...props} />;
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn("overflow-hidden p-1", className)} {...props} />;
}

export function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />
  );
}

export function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-[var(--radius-sm)] border-l-2 border-l-transparent px-2 py-1.5 text-base outline-none data-[selected=true]:border-l-[var(--accent)] data-[selected=true]:bg-selected data-[selected=true]:text-fg data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
