"use client";

// Provides the CommandContext to the React tree. The real app uses a client
// context backed by the sync provider registry, keyed by the authenticated
// user id (one content doc per user — room `board:{userId}`); tests inject an
// in-memory context via the `context` prop.
//
// Because `<BoardlyProvider>` lives below `<AuthGate>`, a userId is always
// present in the real app. Keying the local doc by that id (rather than the
// old shared `"local"` key) is what fixes the cross-account local-doc leak
// (plan R5): sign into a different account and you get a different local doc.
import type { CommandContext } from "@boardly/commands";
import { createClientContext } from "@boardly/commands/client";
import { getBoardDoc } from "@boardly/sync/client";
import { type ReactNode, createContext, useContext, useMemo } from "react";

import { useAuthSession } from "./auth-store";

const Ctx = createContext<CommandContext | null>(null);

export function BoardlyProvider({
  children,
  context,
}: {
  children: ReactNode;
  context?: CommandContext;
}) {
  const { userId } = useAuthSession();
  const value = useMemo<CommandContext | null>(() => {
    if (context) return context;
    if (!userId) return null;
    const clientId = String(getBoardDoc(userId).doc.clientID);
    return createClientContext({ userId, clientId });
  }, [context, userId]);

  // Rendered under <AuthGate>, so a real userId is guaranteed; the guard only
  // covers the transient loading frame (and never fires when `context` is set).
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoardlyContext(): CommandContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBoardlyContext must be used within <BoardlyProvider>");
  return ctx;
}
