"use client";

import { useEffect, useState } from "react";

import { apiClient } from "./api-client";

export interface StorageBucket {
  usedBytes: number;
  limitBytes: number;
}

export interface StorageUsage {
  database: StorageBucket;
  files: StorageBucket;
}

export interface StorageUsageState {
  data: StorageUsage | null;
  loading: boolean;
  error: boolean;
}

/**
 * Fetch storage usage (db + files vs configured caps) from `GET /api/storage`
 * once on mount. No polling — the Settings section refetches whenever it
 * remounts (i.e. each time it's opened).
 */
export function useStorageUsage(): StorageUsageState {
  const [state, setState] = useState<StorageUsageState>({
    data: null,
    loading: true,
    error: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.authFetch("/api/storage");
        if (!res.ok) throw new Error(`storage request failed (${res.status})`);
        const data = (await res.json()) as StorageUsage;
        if (!cancelled) setState({ data, loading: false, error: false });
      } catch {
        if (!cancelled) setState({ data: null, loading: false, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
