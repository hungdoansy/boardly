"use client";

import {
  attachNetwork,
  boardDocName,
  getBoardDoc,
  type NetworkHandle,
} from "@boardly/sync/client";
import { useEffect } from "react";

import { apiClient, SYNC_WS_URL } from "../../lib/api-client";
import { useAuthSession } from "../../lib/auth-store";

/**
 * Bridges the local Yjs doc to the sync server once authenticated: attaches the
 * single per-user content doc (room `board:{userId}`), whose sync room the
 * server authorizes iff the room id equals the requesting user's id — so there
 * is no board list, no ownership registration, and no reconcile loop. Attaches
 * only after local hydrate (`attachNetwork` → `whenSynced`).
 */
export function SyncBridge() {
  const { status, userId } = useAuthSession();

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let net: NetworkHandle | undefined;
    let disposed = false;
    void attachNetwork(getBoardDoc(userId), {
      documentName: boardDocName(userId),
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
