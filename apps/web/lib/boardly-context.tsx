"use client";

// Provides the CommandContext to the React tree. The real app uses a
// client context backed by the sync provider registry; tests inject an
// in-memory context via the `context` prop.
import type { CommandContext } from "@boardly/commands";
import { createClientContext } from "@boardly/commands/client";
import { getWorkspaceDoc } from "@boardly/sync/client";
import { type ReactNode, createContext, useContext, useMemo } from "react";

/** Single local user until auth lands (Phase 3). */
export const LOCAL_USER = "local";

let singleton: CommandContext | null = null;
function defaultContext(): CommandContext {
  if (!singleton) {
    const clientId = String(getWorkspaceDoc(LOCAL_USER).doc.clientID);
    singleton = createClientContext({ userId: LOCAL_USER, clientId });
  }
  return singleton;
}

const Ctx = createContext<CommandContext | null>(null);

export function BoardlyProvider({
  children,
  context,
}: {
  children: ReactNode;
  context?: CommandContext;
}) {
  const value = useMemo(() => context ?? defaultContext(), [context]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoardlyContext(): CommandContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBoardlyContext must be used within <BoardlyProvider>");
  return ctx;
}
