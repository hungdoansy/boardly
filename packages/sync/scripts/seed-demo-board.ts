/**
 * Seed an extensive demo board into a running Boardly stack, exercising every
 * implemented feature: columns + WIP limits, cards across all statuses, every
 * priority/severity, due dates (overdue/today/this-week/future), multi-labels,
 * links for every provider, checklists (with completed items), markdown
 * descriptions, rich activity logs, and saved views (board + list lenses).
 *
 * It talks to the real server exactly like the web client does:
 *   1. log in (or sign up) over HTTP → access token + userId (JWT `sub`),
 *   2. POST /boards to register ownership (authorizes the board's sync room),
 *   3. connect the workspace + board Yjs docs over the /sync WebSocket via
 *      one-time tickets, mutate them, and let Hocuspocus persist to Postgres.
 *
 * Mutations go through the `@boardly/sync` typed accessors (the exact
 * primitives the command layer wraps) rather than `@boardly/commands`, purely
 * because this script runs in `packages/sync`'s module graph where the command
 * package isn't resolvable. The accessors append the same activity entries the
 * commands do, so the seeded activity log is faithful.
 *
 * Run (from repo root, pinned Node):
 *   export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
 *   apps/server/node_modules/.bin/tsx packages/sync/scripts/seed-demo-board.ts
 *
 * Env overrides: API_URL (default http://localhost:8787), SEED_EMAIL,
 * SEED_PASSWORD, BOARD_TITLE.
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  LABEL_COLORS,
  LinkProvider,
  newId,
  Priority,
  type PriorityValue,
  type SeverityValue,
  Severity,
  Status,
} from "@boardly/domain";
import * as Y from "yjs";

import {
  addBoardRef,
  addCard,
  addChecklistItem,
  addColumn,
  addLabel,
  assignLabel,
  addLink,
  initBoard,
  saveView,
  setBadgeConfig,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
  setCardStatus,
  setColumnWipLimit,
  toggleChecklistItem,
} from "../src/index";

// --- config -----------------------------------------------------------------

const API_URL = (process.env.API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WS_URL = `${API_URL.replace(/^http/, "ws")}/sync`;
const EMAIL = process.env.SEED_EMAIL ?? "demo@boardly.app";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo-boardly-2026";
const BOARD_TITLE = process.env.BOARD_TITLE ?? "Boardly Demo — Everything";
const CLIENT_ID = "seed-script";

const DAY = 24 * 60 * 60 * 1000;
// A fixed clock so activity ordering + `updatedAt` are deterministic; each
// mutation advances it a minute so the activity feed reads like real history.
let clock = Date.now() - 14 * DAY;
const tick = (): number => (clock += 60_000);

// --- HTTP helpers ------------------------------------------------------------

function decodeJwtSub(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()) as {
    sub?: string;
  };
  if (!payload.sub) throw new Error("token has no sub");
  return payload.sub;
}

async function authenticate(): Promise<{ token: string; userId: string }> {
  const login = async (): Promise<string | null> => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: string };
    return data.accessToken ?? null;
  };

  let token = await login();
  if (!token) {
    // Account may not exist yet — sign up (idempotent server-side), then log in.
    await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    token = await login();
  }
  if (!token) throw new Error(`could not authenticate as ${EMAIL} (check the password/rate limit)`);
  return { token, userId: decodeJwtSub(token) };
}

async function registerBoard(token: string, id: string, title: string): Promise<void> {
  const res = await fetch(`${API_URL}/boards`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, title }),
  });
  if (!res.ok) throw new Error(`register board failed (${res.status})`);
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

/** Connect a Yjs doc to the sync server and resolve once initially synced. */
function connect(
  doc: Y.Doc,
  documentName: string,
  mintTicket: (name: string) => Promise<string>,
): { provider: HocuspocusProvider; synced: Promise<void> } {
  // Node 22 ships a global WebSocket, which the provider's default connection
  // picks up — no polyfill needed.
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

// --- demo data ---------------------------------------------------------------

const color = (name: string): string => LABEL_COLORS.find((c) => c.name === name)!.value;

interface CardSpec {
  column: string; // column key below
  title: string;
  description?: string;
  status?: string;
  priority?: PriorityValue;
  severity?: SeverityValue | null;
  labels?: string[]; // label keys
  links?: Array<{
    url: string;
    title?: string;
    provider?: (typeof LinkProvider)[keyof typeof LinkProvider];
  }>;
  checklist?: Array<{ text: string; done?: boolean }>;
  dueInDays?: number; // relative to now; negative = overdue
}

const COLUMNS: Array<{ key: string; title: string; wip?: number }> = [
  { key: "backlog", title: "Backlog" },
  { key: "todo", title: "Todo", wip: 5 },
  { key: "doing", title: "In Progress", wip: 3 },
  { key: "review", title: "In Review", wip: 2 },
  { key: "done", title: "Done" },
];

const LABELS: Array<{ key: string; name: string; color: string }> = [
  { key: "frontend", name: "Frontend", color: color("blue") },
  { key: "backend", name: "Backend", color: color("indigo") },
  { key: "bug", name: "Bug", color: color("red") },
  { key: "design", name: "Design", color: color("violet") },
  { key: "infra", name: "Infra", color: color("teal") },
  { key: "docs", name: "Docs", color: color("slate") },
  { key: "urgent", name: "Urgent", color: color("orange") },
];

const CARDS: CardSpec[] = [
  {
    column: "backlog",
    title: "Research offline-first conflict resolution",
    description:
      "## Goal\nEvaluate CRDT vs OT for the sync layer.\n\n- [x] Read the Yjs internals docs\n- Compare with Automerge\n\n> Decision needed before Phase 4.",
    status: Status.Backlog,
    priority: Priority.Low,
    labels: ["backend", "docs"],
    links: [{ url: "https://github.com/yjs/yjs", title: "yjs/yjs" }],
  },
  {
    column: "backlog",
    title: "Design the mobile card layout",
    description: "Narrow-viewport card face. Needs a Figma pass.",
    status: Status.Backlog,
    priority: Priority.Medium,
    labels: ["design", "frontend"],
    links: [{ url: "https://www.figma.com/file/abc/Boardly-Mobile" }],
    checklist: [{ text: "Audit current breakpoints" }, { text: "Sketch 3 density options" }],
  },
  {
    column: "todo",
    title: "Add keyboard shortcut for quick-capture",
    description: "Global `c` to open the composer from anywhere.",
    status: Status.Todo,
    priority: Priority.Medium,
    labels: ["frontend"],
    dueInDays: 5,
    links: [{ url: "https://linear.app/boardly/issue/BRD-142", title: "BRD-142" }],
  },
  {
    column: "todo",
    title: "Fix drag ghost flicker on Safari",
    description: "The drag preview flashes at drop. Compositor issue — investigate `transform`.",
    status: Status.Todo,
    priority: Priority.High,
    severity: Severity.S2,
    labels: ["bug", "frontend"],
    dueInDays: 2,
    checklist: [
      { text: "Reproduce on Safari 17", done: true },
      { text: "Bisect the offending commit" },
      { text: "Add a regression e2e" },
    ],
    links: [{ url: "https://github.com/boardly/app/issues/318", title: "#318" }],
  },
  {
    column: "todo",
    title: "Document the command layer for contributors",
    status: Status.Todo,
    priority: Priority.Low,
    labels: ["docs"],
    dueInDays: 12,
  },
  {
    column: "doing",
    title: "Ship the list view + Linear-style filters",
    description:
      "One model, two lenses. Board + list derive from the same `ActiveView`.\n\n**Almost done** — polishing the toolbar.",
    status: Status.InProgress,
    priority: Priority.High,
    labels: ["frontend"],
    dueInDays: 1,
    checklist: [
      { text: "resolveView pipeline", done: true },
      { text: "Filter builder (AND/OR)", done: true },
      { text: "List view", done: true },
      { text: "View toolbar", done: true },
    ],
    links: [
      { url: "https://linear.app/boardly/issue/BRD-100", title: "BRD-100" },
      { url: "https://boardly.slack.com/archives/C01/p1720", provider: LinkProvider.Slack },
    ],
  },
  {
    column: "doing",
    title: "Investigate WebSocket reconnect storm",
    description: "Under flaky network the provider reconnects too aggressively.",
    status: Status.InProgress,
    priority: Priority.Urgent,
    severity: Severity.S1,
    labels: ["bug", "infra", "urgent"],
    dueInDays: -1,
    links: [{ url: "https://claude.ai/chat/abc-123", provider: LinkProvider.Claude }],
  },
  {
    column: "review",
    title: "Card drawer UI polish",
    description: "Base Input/Button hover + disabled states; activity row alignment.",
    status: Status.InReview,
    priority: Priority.Medium,
    labels: ["frontend", "design"],
    dueInDays: 0,
    links: [{ url: "https://github.com/boardly/app/pull/402", title: "#402" }],
    checklist: [
      { text: "Add-card details button", done: true },
      { text: "Composer input clipping", done: true },
    ],
  },
  {
    column: "review",
    title: "Rate-limit the auth endpoints",
    description: "5/min on login; lift for e2e via env.",
    status: Status.InReview,
    priority: Priority.High,
    severity: Severity.S3,
    labels: ["backend", "infra"],
    links: [{ url: "https://github.com/boardly/app/pull/377", title: "#377" }],
  },
  {
    column: "done",
    title: "Yjs schema + typed accessors",
    description: "Board doc, workspace doc, fractional ordering, short ids.",
    status: Status.Done,
    priority: Priority.High,
    labels: ["backend"],
    checklist: [
      { text: "board-doc", done: true },
      { text: "workspace-doc", done: true },
    ],
  },
  {
    column: "done",
    title: "Static export + auth handshake",
    status: Status.Done,
    priority: Priority.Medium,
    labels: ["frontend", "backend"],
    links: [{ url: "https://github.com/boardly/app/pull/210", title: "#210" }],
  },
  {
    column: "done",
    title: "Abandoned: custom OT engine",
    description: "Superseded by Yjs. Kept for the record.",
    status: Status.Canceled,
    priority: Priority.None,
    labels: ["backend"],
  },
];

// --- build -------------------------------------------------------------------

function buildBoard(workspaceDoc: Y.Doc, boardDoc: Y.Doc, boardId: string, userId: string): void {
  addBoardRef(workspaceDoc, { id: boardId, title: BOARD_TITLE, icon: "🗂️", clientId: CLIENT_ID });
  initBoard(boardDoc, { title: BOARD_TITLE, icon: "🗂️", now: tick(), createdBy: userId });
  // Show a rich badge row on the card face.
  setBadgeConfig(boardDoc, ["priority", "severity", "dueDate", "labels", "checklist"], tick());

  const columnId: Record<string, string> = {};
  for (const c of COLUMNS) {
    const id = addColumn(boardDoc, { title: c.title, now: tick(), clientId: CLIENT_ID });
    columnId[c.key] = id;
    if (c.wip !== undefined) setColumnWipLimit(boardDoc, id, c.wip, tick());
  }

  const labelId: Record<string, string> = {};
  for (const l of LABELS) {
    labelId[l.key] = addLabel(boardDoc, {
      name: l.name,
      color: l.color,
      now: tick(),
      clientId: CLIENT_ID,
    });
  }

  for (const spec of CARDS) {
    const id = addCard(boardDoc, {
      columnId: columnId[spec.column]!,
      title: spec.title,
      now: tick(),
      clientId: CLIENT_ID,
      createdBy: userId,
    });
    if (spec.description) setCardDescription(boardDoc, id, spec.description, tick());
    if (spec.status && spec.status !== Status.Todo)
      setCardStatus(boardDoc, id, spec.status as Status, tick(), userId);
    if (spec.priority !== undefined && spec.priority !== Priority.None)
      setCardPriority(boardDoc, id, spec.priority, tick(), userId);
    if (spec.severity != null) setCardSeverity(boardDoc, id, spec.severity, tick(), userId);
    if (spec.dueInDays !== undefined)
      setCardDueDate(
        boardDoc,
        id,
        { at: Date.now() + spec.dueInDays * DAY, hasTime: false },
        tick(),
        userId,
      );
    for (const key of spec.labels ?? []) assignLabel(boardDoc, id, labelId[key]!, tick());
    for (const link of spec.links ?? [])
      addLink(boardDoc, {
        cardId: id,
        url: link.url,
        title: link.title,
        provider: link.provider,
        now: tick(),
        clientId: CLIENT_ID,
      });
    for (const item of spec.checklist ?? []) {
      const itemId = addChecklistItem(boardDoc, {
        cardId: id,
        text: item.text,
        now: tick(),
        clientId: CLIENT_ID,
      });
      if (item.done) toggleChecklistItem(boardDoc, id, itemId, tick());
    }
  }

  // Saved views — exercise both lenses, grouping, sorting, and filters.
  saveView(
    boardDoc,
    {
      id: newId(),
      name: "My urgent work",
      filter: {
        op: "or",
        clauses: [{ field: "priority", condition: "is", values: [Priority.Urgent, Priority.High] }],
      },
      groupBy: "priority",
      sort: { field: "priority", direction: "desc" },
      layout: "board",
    },
    tick(),
  );
  saveView(
    boardDoc,
    {
      id: newId(),
      name: "Bugs",
      filter: {
        op: "and",
        clauses: [{ field: "label", condition: "hasAny", values: [labelId.bug!] }],
      },
      sort: { field: "priority", direction: "desc" },
      layout: "list",
    },
    tick(),
  );
  saveView(
    boardDoc,
    {
      id: newId(),
      name: "Due this week",
      filter: {
        op: "and",
        clauses: [{ field: "dueDate", condition: "isWithin", values: ["week"] }],
      },
      sort: { field: "dueDate", direction: "asc" },
      groupBy: "status",
      layout: "list",
    },
    tick(),
  );
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`→ authenticating as ${EMAIL} at ${API_URL}`);
  const { token, userId } = await authenticate();
  const mintTicket = makeTicketMinter(token);

  const boardId = newId();
  console.log(`→ registering board ${boardId}`);
  await registerBoard(token, boardId, BOARD_TITLE);

  const workspaceDoc = new Y.Doc();
  const boardDoc = new Y.Doc();
  const ws = connect(workspaceDoc, `workspace:${userId}`, mintTicket);
  const bd = connect(boardDoc, `board:${boardId}`, mintTicket);

  console.log("→ waiting for initial sync…");
  await Promise.all([ws.synced, bd.synced]);

  console.log("→ building the demo board…");
  buildBoard(workspaceDoc, boardDoc, boardId, userId);

  // Give Hocuspocus time to receive + debounce-persist the updates.
  console.log("→ flushing to the server…");
  await sleep(3000);

  ws.provider.destroy();
  bd.provider.destroy();
  await sleep(300);

  console.log("\n✓ Seeded successfully.");
  console.log(`  Board:    ${BOARD_TITLE} (${boardId})`);
  console.log(`  Cards:    ${CARDS.length} across ${COLUMNS.length} columns`);
  console.log(`  Log in at http://localhost:3000 with:`);
  console.log(`    email:    ${EMAIL}`);
  console.log(`    password: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
