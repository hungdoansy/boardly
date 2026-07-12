/**
 * Seed an extensive demo board into a running Boardly stack, exercising every
 * implemented feature: cards spread across the eight fixed Linear status
 * columns (Backlog, Todo, In Progress, Pending, In Review, Done, Canceled,
 * Duplicate), every priority/severity, due dates (overdue/today/this-week/
 * future), multi-labels, links for every provider, checklists (with completed
 * items), markdown descriptions, rich activity logs, projects, and saved views
 * (board + list lenses).
 *
 * Since the board layer was collapsed (plan 2026-07-12-002), a user has exactly
 * ONE content doc, addressed and authorized by the user's id — room
 * `board:{userId}`. There is no workspace index doc, no `boards` table, and no
 * `POST /boards` registration step. So this script simply:
 *   1. logs in (or signs up) over HTTP → access token + userId (JWT `sub`),
 *   2. connects that user's single Yjs doc `board:{userId}` over the /sync
 *      WebSocket via a one-time ticket (authorized purely by identity), and
 *   3. if the doc is empty, mutates it and lets Hocuspocus persist to Postgres.
 *
 * It is idempotent: a re-run against an already-populated doc keeps the content
 * as-is (adopt-or-skip) rather than duplicating cards.
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
  addCard,
  addChecklistItem,
  addLabel,
  addProject,
  allLiveCards,
  boardCards,
  assignLabel,
  addLink,
  initBoard,
  saveView,
  setBadgeConfig,
  setCardDescription,
  setCardDueDate,
  setCardPriority,
  setCardSeverity,
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
  // A card's column IS its status (Unit 7): placement is the fixed status.
  status: Status;
  title: string;
  description?: string;
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
  // Assign the card to the demo user themselves. Assignee has no in-app setter
  // yet (no command / card-detail editor), but the list view + filters render
  // it, so the seed sets it directly on the card to exercise that surface.
  assignSelf?: boolean;
}

const LABELS: Array<{ key: string; name: string; color: string }> = [
  { key: "frontend", name: "Frontend", color: color("blue") },
  { key: "backend", name: "Backend", color: color("indigo") },
  { key: "bug", name: "Bug", color: color("red") },
  { key: "design", name: "Design", color: color("violet") },
  { key: "infra", name: "Infra", color: color("teal") },
  { key: "docs", name: "Docs", color: color("slate") },
  { key: "urgent", name: "Urgent", color: color("orange") },
];

// Projects group the board's cards (Unit 6.6/6.7). One project per card.
const PROJECTS: Array<{ key: string; name: string; color: string }> = [
  { key: "web", name: "Web app", color: color("blue") },
  { key: "platform", name: "Platform", color: color("teal") },
  { key: "docs", name: "Docs", color: color("slate") },
];

/** Assign a card to a project from its labels: platform (backend/infra) > docs > web. */
function projectForCard(spec: CardSpec): string {
  const l = spec.labels ?? [];
  if (l.includes("backend") || l.includes("infra")) return "platform";
  if (l.includes("docs")) return "docs";
  return "web";
}

// Cards spread across ALL EIGHT fixed statuses (Backlog…Duplicate), so the
// seeded board exercises every status column and the show/hide-empty toggle.
const CARDS: CardSpec[] = [
  {
    // The "everything" ticket — one card exercising every card-level feature:
    // markdown description, priority + severity, a due date, a diverse label
    // set, a project, a mixed checklist, a multi-provider link cluster (with
    // overflow), and a self-assignee.
    status: Status.InProgress,
    title: "★ Everything ticket — exercises every card feature",
    description:
      "## The kitchen-sink card\nA single ticket wired with **every** card-level feature so you can see them all at once.\n\n- Priority **Urgent** + severity **S1**\n- A **due date**, a **project**, and a **diverse label set**\n- A **checklist** with completed + open items\n- A **link cluster** spanning every provider (with a `+N` overflow)\n- An **assignee** (shown in the list view)\n\n> Description supports GitHub-flavored markdown, incl. `code`, quotes, and lists.",
    priority: Priority.Urgent,
    severity: Severity.S1,
    labels: ["frontend", "backend", "bug", "design", "infra", "docs", "urgent"],
    dueInDays: 1,
    assignSelf: true,
    checklist: [
      { text: "Wire up every badge on the card face", done: true },
      { text: "Attach a link for each provider", done: true },
      { text: "Verify the drawer renders all sections" },
      { text: "Confirm it shows in the list view with an assignee" },
    ],
    links: [
      { url: "https://linear.app/boardly/issue/BRD-1", title: "BRD-1" },
      { url: "https://github.com/boardly/app/pull/500", title: "#500" },
      { url: "https://www.figma.com/file/kitchen/Sink" },
      { url: "https://www.notion.so/boardly/Everything-card-spec" },
      { url: "https://docs.google.com/document/d/everything/edit" },
      { url: "https://boardly.slack.com/archives/C01/p9999", provider: LinkProvider.Slack },
      { url: "https://claude.ai/chat/everything", provider: LinkProvider.Claude },
    ],
  },
  {
    status: Status.Backlog,
    title: "Research offline-first conflict resolution",
    description:
      "## Goal\nEvaluate CRDT vs OT for the sync layer.\n\n- [x] Read the Yjs internals docs\n- Compare with Automerge\n\n> Decision needed before Phase 4.",
    priority: Priority.Low,
    labels: ["backend", "docs"],
    links: [{ url: "https://github.com/yjs/yjs", title: "yjs/yjs" }],
  },
  {
    status: Status.Backlog,
    title: "Design the mobile card layout",
    description: "Narrow-viewport card face. Needs a Figma pass.",
    priority: Priority.Medium,
    labels: ["design", "frontend"],
    links: [{ url: "https://www.figma.com/file/abc/Boardly-Mobile" }],
    checklist: [{ text: "Audit current breakpoints" }, { text: "Sketch 3 density options" }],
  },
  {
    status: Status.Todo,
    title: "Add keyboard shortcut for quick-capture",
    description: "Global `c` to open the composer from anywhere.",
    priority: Priority.Medium,
    labels: ["frontend"],
    dueInDays: 5,
    links: [{ url: "https://linear.app/boardly/issue/BRD-142", title: "BRD-142" }],
  },
  {
    status: Status.Todo,
    title: "Fix drag ghost flicker on Safari",
    description: "The drag preview flashes at drop. Compositor issue — investigate `transform`.",
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
    status: Status.Todo,
    title: "Document the command layer for contributors",
    priority: Priority.Low,
    labels: ["docs"],
    dueInDays: 12,
  },
  {
    status: Status.InProgress,
    title: "Ship the list view + Linear-style filters",
    description:
      "One model, two lenses. Board + list derive from the same `ActiveView`.\n\n**Almost done** — polishing the toolbar.",
    priority: Priority.High,
    labels: ["frontend"],
    dueInDays: 1,
    checklist: [
      { text: "resolveView pipeline", done: true },
      { text: "Filter builder (AND/OR)", done: true },
      { text: "List view", done: true },
      { text: "View toolbar", done: true },
    ],
    // Enough links to exercise the card-face cluster: 5 icons + a "+2" overflow.
    links: [
      { url: "https://linear.app/boardly/issue/BRD-100", title: "BRD-100" },
      { url: "https://boardly.slack.com/archives/C01/p1720", provider: LinkProvider.Slack },
      { url: "https://github.com/boardly/app/pull/402", title: "#402" },
      { url: "https://www.figma.com/file/xyz/List-View" },
      { url: "https://www.notion.so/boardly/List-view-spec-abc" },
      { url: "https://docs.google.com/document/d/abc/edit" },
      { url: "https://claude.ai/chat/list-view-plan", provider: LinkProvider.Claude },
    ],
  },
  {
    status: Status.InProgress,
    title: "Investigate WebSocket reconnect storm",
    description: "Under flaky network the provider reconnects too aggressively.",
    priority: Priority.Urgent,
    severity: Severity.S1,
    labels: ["bug", "infra", "urgent"],
    dueInDays: -1,
    links: [{ url: "https://claude.ai/chat/abc-123", provider: LinkProvider.Claude }],
  },
  {
    status: Status.Pending,
    title: "Await design sign-off on the status columns",
    description: "Blocked on the Linear-style status palette review before we lock the tokens.",
    priority: Priority.Medium,
    labels: ["design", "frontend"],
    dueInDays: 3,
    links: [{ url: "https://www.figma.com/file/def/Status-Columns" }],
  },
  {
    status: Status.Pending,
    title: "Vendor security review of the sync server",
    description: "External audit scheduled; implementation paused until it clears.",
    priority: Priority.High,
    severity: Severity.S3,
    labels: ["backend", "infra"],
  },
  {
    status: Status.InReview,
    title: "Card drawer UI polish",
    description: "Base Input/Button hover + disabled states; activity row alignment.",
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
    status: Status.InReview,
    title: "Rate-limit the auth endpoints",
    description: "5/min on login; lift for e2e via env.",
    priority: Priority.High,
    severity: Severity.S3,
    labels: ["backend", "infra"],
    links: [{ url: "https://github.com/boardly/app/pull/377", title: "#377" }],
  },
  {
    status: Status.Done,
    title: "Yjs schema + typed accessors",
    description: "Per-user board doc, fractional ordering, short ids.",
    priority: Priority.High,
    labels: ["backend"],
    checklist: [
      { text: "board-doc", done: true },
      { text: "status placement", done: true },
    ],
  },
  {
    status: Status.Done,
    title: "Static export + auth handshake",
    priority: Priority.Medium,
    labels: ["frontend", "backend"],
    links: [{ url: "https://github.com/boardly/app/pull/210", title: "#210" }],
  },
  {
    status: Status.Canceled,
    title: "Abandoned: custom OT engine",
    description: "Superseded by Yjs. Kept for the record.",
    priority: Priority.None,
    labels: ["backend"],
  },
  {
    status: Status.Duplicate,
    title: "Add per-column WIP limits",
    description:
      "Duplicate of the fixed-status-columns work — WIP limits were dropped when columns became the eight fixed Linear statuses (no add/rename/reorder/WIP).",
    priority: Priority.None,
    labels: ["frontend"],
  },
];

// --- build -------------------------------------------------------------------

function buildBoard(boardDoc: Y.Doc, userId: string): void {
  // A "BRD" prefix shows ids as BRD-1, BRD-2… (matching this demo's link refs);
  // an empty prefix would show them as #1, #2 (Unit 6.1).
  initBoard(boardDoc, {
    title: BOARD_TITLE,
    icon: "🗂️",
    shortIdPrefix: "BRD",
    now: tick(),
    createdBy: userId,
  });
  // Rich card face: status, priority/severity, due date, labels, the link
  // cluster (Unit 6.4), and the checklist meter.
  setBadgeConfig(
    boardDoc,
    ["status", "priority", "severity", "dueDate", "labels", "links", "checklist"],
    tick(),
  );

  const labelId: Record<string, string> = {};
  for (const l of LABELS) {
    labelId[l.key] = addLabel(boardDoc, {
      name: l.name,
      color: l.color,
      now: tick(),
      clientId: CLIENT_ID,
    });
  }

  const projectId: Record<string, string> = {};
  for (const p of PROJECTS) {
    projectId[p.key] = addProject(boardDoc, {
      name: p.name,
      color: p.color,
      now: tick(),
      clientId: CLIENT_ID,
    });
  }

  for (const spec of CARDS) {
    // A card's column IS its status — placement is set directly at creation.
    const id = addCard(boardDoc, {
      status: spec.status,
      title: spec.title,
      projectId: projectId[projectForCard(spec)]!,
      now: tick(),
      clientId: CLIENT_ID,
      createdBy: userId,
    });
    // Assignee has no dedicated accessor/command yet; set it directly on the
    // card map (the list view + filters read `assigneeId`).
    if (spec.assignSelf) boardCards(boardDoc).get(id)?.set("assigneeId", userId);
    if (spec.description) setCardDescription(boardDoc, id, spec.description, tick());
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

  // Connect the user's SINGLE content doc, addressed + authorized by identity
  // (room id == userId). No workspace index, no board registration.
  const boardDoc = new Y.Doc();
  const documentName = `board:${userId}`;
  const bd = connect(boardDoc, documentName, mintTicket);
  console.log(`→ waiting for ${documentName} sync…`);
  await bd.synced;

  // Idempotent adopt-or-skip: only populate an empty doc; on re-run keep the
  // existing content as-is (no duplicate cards).
  if (allLiveCards(boardDoc).length === 0) {
    console.log("→ building the demo board…");
    buildBoard(boardDoc, userId);
  } else {
    console.log("→ demo board already populated; kept as-is.");
  }

  // Give Hocuspocus time to receive + debounce-persist the updates.
  console.log("→ flushing to the server…");
  await sleep(3000);

  bd.provider.destroy();
  await sleep(300);

  console.log("\n✓ Seeded successfully.");
  console.log(`  Board:    ${BOARD_TITLE} (${documentName})`);
  console.log(`  Cards:    ${CARDS.length} across the 8 fixed status columns`);
  console.log(`  Log in at http://localhost:3000 with:`);
  console.log(`    email:    ${EMAIL}`);
  console.log(`    password: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Seed failed:", err);
  process.exit(1);
});
