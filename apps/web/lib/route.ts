import { parseProjectRef, parseTicketRef } from "@boardly/domain";

/**
 * Single hash-route grammar for the app (static-export friendly — the URL hash
 * is the only routing surface). Everything the workspace can be "at" is encoded
 * after the `#`:
 *
 *   ""                          → the board, All projects
 *   "p/<projectRef>"            → the board, scoped to a project
 *   "<ticketRef>"              → All projects, a card open   (e.g. `BRD-42-slug`)
 *   "p/<projectRef>/<ticketRef>" → a project scope + a card open
 *   "settings"                  → the Settings view (global; no project, no card)
 *
 * `<projectRef>` is `<id>-<slug>` (see `formatProjectRef`). A ticket ref never
 * contains `/` (slugs collapse non-alphanumerics to hyphens), so `/` is a safe
 * segment separator, and `p` is a reserved first segment (real ticket refs are
 * `PREFIX-N-slug`, never the bare token `p`).
 */
export interface Route {
  settings: boolean;
  /** The raw `<id>-<slug>` project segment as it appears in the URL, for rebuilding. */
  projectRef: string | null;
  /** The resolved project id (from `projectRef`), for lookup. */
  projectId: string | null;
  /** The ticket number of the open card, or null when no card is open. */
  ticketNumber: number | null;
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  if (raw === "settings") {
    return { settings: true, projectRef: null, projectId: null, ticketNumber: null };
  }

  const parts = raw.split("/").filter(Boolean);
  let projectRef: string | null = null;
  let projectId: string | null = null;
  let idx = 0;
  if (parts[0] === "p" && parts[1]) {
    projectRef = parts[1];
    projectId = parseProjectRef(parts[1]);
    idx = 2;
  }
  const refSeg = parts[idx];
  return {
    settings: false,
    projectRef,
    projectId,
    ticketNumber: refSeg ? parseTicketRef(refSeg) : null,
  };
}

/**
 * Build the hash body (no leading `#`) for a board route, optionally with a
 * card. `projectRef` is the raw `<id>-<slug>` segment (from `formatProjectRef`)
 * so the slug is preserved across card open/close.
 */
export function buildBoardHash(projectRef: string | null, ticketRef?: string): string {
  const seg = projectRef ? `p/${projectRef}` : "";
  if (ticketRef) return seg ? `${seg}/${ticketRef}` : ticketRef;
  return seg;
}

/** The current hash body (no leading `#`), or "" outside the browser. */
export function currentHashBody(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

// One notifier for every route hook (project scope, settings, open card) so an
// in-app navigation updates them all in the same tick — jsdom (and some
// browsers) fire `hashchange` asynchronously, which would otherwise let the
// hooks tear apart mid-interaction.
const routeListeners = new Set<() => void>();

/** Subscribe to route changes: in-app writes (synchronous) and back/forward nav. */
export function subscribeRoute(cb: () => void): () => void {
  routeListeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("hashchange", cb);
  return () => {
    routeListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("hashchange", cb);
  };
}

/** Write a hash body, no-op if unchanged (avoids spurious history entries). */
export function writeHashBody(body: string): void {
  if (typeof window === "undefined") return;
  if (currentHashBody() === body) return;
  window.location.hash = body;
  for (const l of routeListeners) l();
}
