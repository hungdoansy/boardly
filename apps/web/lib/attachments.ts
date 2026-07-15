"use client";

// Client broker for description image attachments (mirrors unfurl-client.ts):
// uploads go through the authenticated API, and owned images are displayed via
// an authenticated blob fetch → object URL (browsers can't put a Bearer header
// on `<img src>`, and the API is a different origin than the web app).
import { useEffect, useState } from "react";

import { apiClient } from "./api-client";

const ATTACHMENT_PATH_PREFIX = "/attachments/";
// Owned-image references are root-relative (`/attachments/<id>`) so the markdown
// is origin-independent (dev :8787 / prod :8788 / desktop tauri://). The browser
// never resolves the path — we parse the id out and fetch from API_BASE_URL.
const ATTACHMENT_SRC_RE = /^\/attachments\/([\w-]+)$/;

export class AttachmentUploadError extends Error {
  constructor(message = "upload failed") {
    super(message);
    this.name = "AttachmentUploadError";
  }
}

export interface UploadedAttachment {
  id: string;
}

/** The stable markdown reference string for an uploaded attachment. */
export function attachmentRef(id: string): string {
  return `${ATTACHMENT_PATH_PREFIX}${id}`;
}

/** Extract an attachment id from an owned-image `src`, or `null` if it's external. */
export function attachmentIdFromSrc(src: string): string | null {
  return ATTACHMENT_SRC_RE.exec(src)?.[1] ?? null;
}

/** Upload one image file and return its id. Throws {@link AttachmentUploadError} on any failure. */
export async function uploadAttachment(file: File): Promise<UploadedAttachment> {
  const body = new FormData();
  body.append("file", file, file.name);

  let res: Response;
  try {
    res = await apiClient.authFetch("/api/attachments", { method: "POST", body });
  } catch {
    throw new AttachmentUploadError("network error");
  }
  if (!res.ok) throw new AttachmentUploadError(`upload failed (${res.status})`);

  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new AttachmentUploadError("missing id");
  return { id: data.id };
}

export interface AttachmentImageState {
  /** Object URL to render, or `null` while loading, on error, or for external images. */
  objectUrl: string | null;
  /** True when `src` is an external (non-owned) URL — render it as a plain `<img>`. */
  external: boolean;
  loading: boolean;
  error: boolean;
}

/**
 * Resolve an image `src` to a renderable value. For an owned reference
 * (`/attachments/<id>`), authenticate-fetch the bytes and expose them as an
 * object URL, revoking it on unmount or when the id changes. For any other src
 * (external `http(s)`), returns `{ external: true }` so the caller renders a
 * plain `<img>`.
 */
export function useAttachmentObjectUrl(src: string): AttachmentImageState {
  const id = attachmentIdFromSrc(src);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(id !== null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (id === null) return; // external image — nothing to fetch

    let cancelled = false;
    let created: string | null = null;
    setLoading(true);
    setError(false);
    setObjectUrl(null);

    void (async () => {
      try {
        const res = await apiClient.authFetch(attachmentRef(id));
        if (!res.ok) throw new Error(`serve failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);

  return { objectUrl, external: id === null, loading, error };
}
