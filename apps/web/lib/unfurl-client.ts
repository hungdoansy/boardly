// Client-side unfurl for generic links: title + favicon via the server's
// `/api/unfurl` (Unit 3.7). On web it fetches that endpoint; the desktop build
// swaps in a native CORS-free fetch (Unit 5.2). Any failure returns null so the
// card falls back to the hostname — never breaks.
import { API_BASE_URL } from "./api-client";

export interface Unfurled {
  title?: string;
  iconUrl?: string;
}

export async function unfurl(url: string): Promise<Unfurled | null> {
  // Pre-flight: never round-trip non-http(s) (javascript:/data: etc.).
  if (!/^https?:\/\//i.test(url)) return null;
  // SSRF note: the server `/api/unfurl` handler (Unit 3.7) owns the
  // outbound-fetch defenses — scheme allowlist, blocking loopback / RFC-1918
  // / link-local hosts after DNS resolution, and manual redirect re-validation.
  try {
    const res = await fetch(`${API_BASE_URL}/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as Unfurled;
  } catch {
    return null;
  }
}
