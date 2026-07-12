/**
 * One-off maintenance script: actively purge every trace of the removed
 * `severity` field from a real account's live board doc (plan
 * 2026-07-12-003) — not just stop reading it. Strips:
 *   1. the `severity` key from every card's Y.Map,
 *   2. `"severity"` from the board's `badgeConfig` array,
 *   3. any saved view's filter clause with `field: "severity"` (recursively,
 *      through nested AND/OR groups), and clears `groupBy` to `null` if it's
 *      `"severity"`,
 *   4. activity-log entries with `type: "severity"`.
 *
 * Unlike `seed-demo-board.ts`, this is NOT idempotent-safe-to-rerun-in-CI
 * seed data — it mutates a real user's live doc. Each step is naturally
 * idempotent though (re-running against an already-clean doc is a no-op), so
 * it's safe to run more than once if a prior run was interrupted.
 *
 * Targets the account given by CLEANUP_EMAIL/CLEANUP_PASSWORD — there is no
 * default, unlike the seed scripts (which default to the demo account): this
 * script is meant for the real personal account, and defaulting to anything
 * would risk running it against the wrong doc.
 *
 * Uses raw Yjs primitives (`Y.Map.delete`, plain-array rewrites) rather than
 * the typed `@boardly/sync` severity accessors — those no longer exist as of
 * this same plan's Unit 3.
 *
 * Run (from repo root, pinned Node; API server + Docker `boardly-db` up):
 *   export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
 *   CLEANUP_EMAIL=you@example.com CLEANUP_PASSWORD=your-password \
 *     apps/server/node_modules/.bin/tsx packages/sync/scripts/cleanup-severity.ts
 *
 * Env: API_URL (default http://localhost:8787), CLEANUP_EMAIL (required),
 * CLEANUP_PASSWORD (required).
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Filter, SavedView } from "@boardly/domain";
import * as Y from "yjs";

import { boardActivity, boardCards, boardMeta, listViews, saveView } from "../src/index";

const API_URL = (process.env.API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WS_URL = `${API_URL.replace(/^http/, "ws")}/sync`;
const EMAIL = process.env.CLEANUP_EMAIL;
const PASSWORD = process.env.CLEANUP_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("✗ CLEANUP_EMAIL and CLEANUP_PASSWORD are required (no default — see file header).");
  process.exit(1);
}

function decodeJwtSub(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as {
    sub?: string;
  };
  if (!payload.sub) throw new Error("token has no sub");
  return payload.sub;
}

async function authenticate(): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error("login response missing accessToken");
  return { token: data.accessToken, userId: decodeJwtSub(data.accessToken) };
}

function makeTicketMinter(token: string): (documentName: string) => Promise<string> {
  return async (documentName) => {
    const res = await fetch(`${API_URL}/sync/ticket`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentName }),
    });
    if (!res.ok) throw new Error(`sync ticket failed for ${documentName} (${res.status})`);
    const data = (await res.json()) as { ticket?: string };
    if (!data.ticket) throw new Error("sync ticket missing");
    return data.ticket;
  };
}

function connect(
  doc: Y.Doc,
  documentName: string,
  mintTicket: (name: string) => Promise<string>,
): { provider: HocuspocusProvider; synced: Promise<void> } {
  const provider = new HocuspocusProvider({
    url: WS_URL,
    name: documentName,
    document: doc,
    token: () => mintTicket(documentName),
    onAuthenticationFailed: ({ reason }) => {
      throw new Error(`sync auth failed for ${documentName}: ${reason}`);
    },
  });
  const synced = new Promise<void>((resolve) => {
    provider.on("synced", () => resolve());
  });
  return { provider, synced };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A filter clause/group shaped loosely enough to hold a legacy `"severity"` field. */
type LegacyClause = { field?: string } & Record<string, unknown>;
type LegacyGroup = { op: "and" | "or"; clauses: Array<LegacyClause | LegacyGroup> };

const isGroup = (node: LegacyClause | LegacyGroup): node is LegacyGroup =>
  Array.isArray((node as LegacyGroup).clauses);

/** Recursively drop any clause (at any nesting depth) whose field is "severity". */
function stripSeverityClauses(group: LegacyGroup): LegacyGroup {
  return {
    ...group,
    clauses: group.clauses
      .filter((node) => isGroup(node) || node.field !== "severity")
      .map((node) => (isGroup(node) ? stripSeverityClauses(node) : node)),
  };
}

async function main(): Promise<void> {
  console.log(`→ authenticating as ${EMAIL} at ${API_URL}`);
  const { token, userId } = await authenticate();
  const mintTicket = makeTicketMinter(token);

  const boardDoc = new Y.Doc();
  const documentName = `board:${userId}`;
  const bd = connect(boardDoc, documentName, mintTicket);
  console.log(`→ waiting for ${documentName} sync…`);
  await bd.synced;

  let cardsCleaned = 0;
  let badgeConfigCleaned = false;
  let viewsCleaned = 0;
  let activityCleaned = 0;

  boardDoc.transact(() => {
    // 1. Card fields.
    for (const card of boardCards(boardDoc).values()) {
      if (card.has("severity")) {
        card.delete("severity");
        cardsCleaned += 1;
      }
    }

    // 2. Badge config.
    const meta = boardMeta(boardDoc);
    const badgeConfig = meta.get("badgeConfig");
    if (Array.isArray(badgeConfig) && badgeConfig.includes("severity")) {
      meta.set(
        "badgeConfig",
        badgeConfig.filter((k) => k !== "severity"),
      );
      badgeConfigCleaned = true;
    }
  });

  // 3. Saved views — filter clauses + groupBy. `saveView` is its own
  // transaction per call, so this runs after the block above rather than
  // inside it.
  for (const view of listViews(boardDoc) as SavedView[]) {
    const rawFilter = view.filter as unknown as LegacyGroup;
    const cleanedFilter = stripSeverityClauses(rawFilter) as unknown as Filter;
    const groupByIsStale = (view.groupBy as unknown as string) === "severity";
    const filterChanged = JSON.stringify(cleanedFilter) !== JSON.stringify(view.filter);
    if (filterChanged || groupByIsStale) {
      saveView(
        boardDoc,
        { ...view, filter: cleanedFilter, groupBy: groupByIsStale ? null : view.groupBy },
        Date.now(),
      );
      viewsCleaned += 1;
    }
  }

  // 4. Activity log — remove `type: "severity"` entries, highest index
  // first so earlier deletions don't shift indices still to be removed.
  boardDoc.transact(() => {
    const activity = boardActivity(boardDoc);
    for (let i = activity.length - 1; i >= 0; i -= 1) {
      if (activity.get(i)?.get("type") === "severity") {
        activity.delete(i, 1);
        activityCleaned += 1;
      }
    }
  });

  console.log("→ flushing to the server…");
  await sleep(3000);

  bd.provider.destroy();
  await sleep(300);

  console.log("\n✓ Cleanup complete.");
  console.log(`  Cards with a severity key removed: ${cardsCleaned}`);
  console.log(`  Badge config: ${badgeConfigCleaned ? "cleaned" : "already clean"}`);
  console.log(`  Saved views rewritten: ${viewsCleaned}`);
  console.log(`  Activity entries removed: ${activityCleaned}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Failed:", err);
  process.exit(1);
});
