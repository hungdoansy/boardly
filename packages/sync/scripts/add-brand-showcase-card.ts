/**
 * Add a single "link provider icon showcase" card to the demo user's board,
 * carrying one link for every brand `@boardly/domain`'s link registry detects
 * (see `packages/domain/src/links/registry.ts`) — so the card drawer's
 * LINKS section exercises every `ProviderIcon` branch at once.
 *
 * Since the board layer was collapsed (plan 2026-07-12-002) a user has exactly
 * ONE content doc, room `board:{userId}`, authorized by identity — so there is
 * no board to discover: this script connects that doc directly and appends one
 * card in Backlog. Run `seed-demo-board.ts` first to populate the rest.
 *
 * Run (from repo root, pinned Node; API server + Docker `boardly-db` up):
 *   export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"
 *   apps/server/node_modules/.bin/tsx packages/sync/scripts/add-brand-showcase-card.ts
 *
 * Env overrides: API_URL, SEED_EMAIL, SEED_PASSWORD.
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import { LinkProvider, Status } from "@boardly/domain";
import * as Y from "yjs";

import { addCard, addLink, setCardDescription } from "../src/index";

const API_URL = (process.env.API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const WS_URL = `${API_URL.replace(/^http/, "ws")}/sync`;
const EMAIL = process.env.SEED_EMAIL ?? "demo@boardly.app";
const PASSWORD = process.env.SEED_PASSWORD ?? "demo-boardly-2026";
const CLIENT_ID = "brand-showcase-script";

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
  if (!res.ok) throw new Error(`login failed (${res.status}) — run seed-demo-board.ts first`);
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

// One representative URL per brand the registry detects (see
// packages/domain/src/links/registry.ts / registry.test.ts for the same set).
const LINKS: Array<{ url: string; provider: (typeof LinkProvider)[keyof typeof LinkProvider] }> = [
  { url: "https://acme.slack.com/archives/C0/p1", provider: LinkProvider.Slack },
  { url: "https://linear.app/boardly/issue/BRD-1", provider: LinkProvider.Linear },
  { url: "https://github.com/anthropics/claude-code/pull/1", provider: LinkProvider.GitHub },
  { url: "https://claude.ai/chat/abc-123", provider: LinkProvider.Claude },
  { url: "https://www.figma.com/file/abc/Boardly-Icons", provider: LinkProvider.Figma },
  {
    url: "https://www.notion.so/Icon-Showcase-abcdef1234567890abcdef1234567890",
    provider: LinkProvider.Notion,
  },
  { url: "https://trello.com/c/abc123/45-showcase-card", provider: LinkProvider.Trello },
  { url: "https://boardly.atlassian.net/browse/BRD-123", provider: LinkProvider.Jira },
  {
    url: "https://boardly.atlassian.net/wiki/spaces/ENG/pages/1",
    provider: LinkProvider.Confluence,
  },
  { url: "https://docs.google.com/document/d/abc", provider: LinkProvider.GoogleDocs },
  { url: "https://sheets.google.com/spreadsheets/d/abc", provider: LinkProvider.GoogleSheets },
  { url: "https://drive.google.com/file/d/abc", provider: LinkProvider.GoogleDrive },
  { url: "https://calendar.google.com/calendar/u/0", provider: LinkProvider.GoogleCalendar },
  { url: "https://meet.google.com/abc-defg-hij", provider: LinkProvider.GoogleMeet },
  { url: "https://loom.com/share/abc", provider: LinkProvider.Loom },
  { url: "https://miro.com/app/board/abc", provider: LinkProvider.Miro },
  { url: "https://www.dropbox.com/s/abc/icons.pdf", provider: LinkProvider.Dropbox },
  { url: "https://www.youtube.com/watch?v=abc", provider: LinkProvider.YouTube },
  { url: "https://zoom.us/j/123456", provider: LinkProvider.Zoom },
  { url: "https://app.asana.com/0/1/2", provider: LinkProvider.Asana },
  { url: "https://airtable.com/app123/tbl456", provider: LinkProvider.Airtable },
  { url: "https://www.facebook.com/boardly/posts/1", provider: LinkProvider.Facebook },
  { url: "https://x.com/boardly/status/1", provider: LinkProvider.Twitter },
  { url: "https://www.instagram.com/p/abc", provider: LinkProvider.Instagram },
  { url: "https://www.linkedin.com/company/boardly", provider: LinkProvider.LinkedIn },
  {
    url: "https://www.reddit.com/r/productivity/comments/1/boardly",
    provider: LinkProvider.Reddit,
  },
  { url: "https://discord.com/channels/1/2", provider: LinkProvider.Discord },
  { url: "https://www.tiktok.com/@boardly/video/1", provider: LinkProvider.TikTok },
  { url: "https://www.pinterest.com/pin/1", provider: LinkProvider.Pinterest },
  { url: "https://wa.me/1234567890", provider: LinkProvider.WhatsApp },
  { url: "https://t.me/boardly", provider: LinkProvider.Telegram },
  {
    url: "https://medium.com/@boardly/shipping-icons-abc123def456",
    provider: LinkProvider.Medium,
  },
  {
    url: "https://stackoverflow.com/questions/123/how-do-brand-icons-work",
    provider: LinkProvider.StackOverflow,
  },
  { url: "https://gitlab.com/boardly/app/-/merge_requests/45", provider: LinkProvider.GitLab },
  { url: "https://bitbucket.org/boardly/app", provider: LinkProvider.Bitbucket },
  { url: "https://www.npmjs.com/package/@boardly/domain", provider: LinkProvider.Npm },
  { url: "https://hub.docker.com/r/library/node", provider: LinkProvider.DockerHub },
  { url: "https://open.spotify.com/track/1", provider: LinkProvider.Spotify },
  { url: "https://www.twitch.tv/boardly", provider: LinkProvider.Twitch },
  { url: "https://vimeo.com/1", provider: LinkProvider.Vimeo },
  { url: "https://www.behance.net/gallery/1", provider: LinkProvider.Behance },
  { url: "https://dribbble.com/shots/1", provider: LinkProvider.Dribbble },
  { url: "https://codepen.io/boardly/pen/1", provider: LinkProvider.CodePen },
  { url: "https://replit.com/@boardly/icon-demo", provider: LinkProvider.Replit },
  { url: "https://stripe.com/docs", provider: LinkProvider.Stripe },
  { url: "https://en.wikipedia.org/wiki/Kanban_board", provider: LinkProvider.Wikipedia },
];

async function main(): Promise<void> {
  console.log(`→ authenticating as ${EMAIL} at ${API_URL}`);
  const { token, userId } = await authenticate();
  const mintTicket = makeTicketMinter(token);

  // The demo user's single content doc, addressed + authorized by identity.
  const boardDoc = new Y.Doc();
  const documentName = `board:${userId}`;
  const bd = connect(boardDoc, documentName, mintTicket);
  console.log(`→ waiting for ${documentName} sync…`);
  await bd.synced;

  console.log(`→ adding showcase card to Backlog with ${LINKS.length} links…`);
  const now = Date.now();
  const cardId = addCard(boardDoc, {
    status: Status.Backlog,
    title: "Link provider icon showcase (all brands)",
    now,
    clientId: CLIENT_ID,
    createdBy: userId,
  });
  setCardDescription(
    boardDoc,
    cardId,
    `One link per brand the link registry detects (\`packages/domain/src/links/registry.ts\`) — ` +
      `exercises every \`ProviderIcon\` branch (${LINKS.length} providers) in one card.`,
    now,
  );
  for (const link of LINKS) {
    addLink(boardDoc, {
      cardId,
      url: link.url,
      provider: link.provider,
      now,
      clientId: CLIENT_ID,
    });
  }

  console.log("→ flushing to the server…");
  await sleep(3000);

  bd.provider.destroy();
  await sleep(300);

  console.log("\n✓ Added successfully.");
  console.log(`  Card:  "Link provider icon showcase (all brands)" in Backlog`);
  console.log(`  Links: ${LINKS.length}`);
  console.log(`  Log in at http://localhost:3000 with:`);
  console.log(`    email:    ${EMAIL}`);
  console.log(`    password: ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Failed:", err);
  process.exit(1);
});
