"use client";

import {
  attachNetwork,
  getWorkspaceDoc,
  workspaceDocName,
  type NetworkHandle,
} from "@boardly/sync/client";
import { useEffect } from "react";

import { apiClient, SYNC_WS_URL } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";
import { LOCAL_USER } from "../../lib/boardly-context";

/**
 * Bridges the local workspace doc to the sync server once authenticated, so the
 * board list syncs across a user's devices. Attaches only after local hydrate
 * (via `attachNetwork` → `whenSynced`) and tears down on logout/unmount.
 *
 * Board *content* docs sync once their `boards` rows exist server-side
 * (Unit 3.8); this bridges the workspace (board list) doc now.
 */
export function SyncBridge() {
  const { status, userId } = useAuthSession();

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let net: NetworkHandle | undefined;
    let disposed = false;

    void attachNetwork(getWorkspaceDoc(LOCAL_USER), {
      documentName: workspaceDocName(userId),
      url: SYNC_WS_URL,
      getTicket: (documentName) => apiClient.getSyncTicket(documentName),
    }).then((handle) => {
      if (disposed) handle.destroy();
      else net = handle;
    });

    return () => {
      disposed = true;
      net?.destroy();
    };
  }, [status, userId]);

  return null;
}
