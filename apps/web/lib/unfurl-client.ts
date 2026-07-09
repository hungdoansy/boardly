// Client-side unfurl for generic links: title + favicon via the server's
// `/api/unfurl` (Unit 3.7). On web it fetches that endpoint; the desktop build
// swaps in a native CORS-free fetch (Unit 5.2). Any failure returns null so the
// card falls back to the hostname — never breaks.
export interface Unfurled {
  title?: string;
  iconUrl?: string;
}

export async function unfurl(url: string): Promise<Unfurled | null> {
  try {
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as Unfurled;
  } catch {
    return null;
  }
}
