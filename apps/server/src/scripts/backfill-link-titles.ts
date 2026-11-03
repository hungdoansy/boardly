// Re-unfurl the titles of links already stored on a board.
//
// A link's title is fetched once, when it is pasted (`useLinkActions.add`), and
// never again. Links added before the brand-only providers were unfurled (see
// `docs/units/UNIT-3.7-link-unfurl.md`) still read "YouTube" or "LinkedIn",
// and nothing in the app will ever fix them. This script does, once:
//
//   BOARDLY_API_URL=http://localhost:8788 BOARDLY_TOKEN=<access token> \
//     pnpm --filter @boardly/server backfill:link-titles [--apply] [--all]
//
// It reads the board with `exportBoard` and writes with `updateLinkTitle`, both
// over the authenticated command API, so every write goes through the command
// layer against the live doc and reaches open clients like a UI edit would.
// Pages are fetched locally with the route's own `fetchHtml` (SSRF guard per
// hop, `</head>` stop, `usableTitle`), so a title lands here only if the route
// would have stored it.
//
// Dry run unless `--apply`. A link whose page can't be reached, or answers with
// nothing usable, keeps its current title.
import { pathToFileURL } from "node:url";

import { shortLabelFor, usableTitle, wantsUnfurl } from "@boardly/domain";
import { z } from "zod";

import {
  defaultLookup,
  fetchHtml,
  normalizeUrl,
  UNFURL_USER_AGENT,
  UnfurlBlockedError,
} from "../routes/unfurl";

/**
 * Retried only when the bot UA got nothing usable. The original audit found
 * LinkedIn job pages answering `BoardlyBot/1.0` with the bare word "LinkedIn"
 * and the real job title to a browser.
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CONCURRENCY = 6;
/** `fetchHtml`'s own 5 s abort covers only the headers; this bounds the body read too. */
const PER_ATTEMPT_TIMEOUT_MS = 20_000;

// Only the fields this script reads; zod strips the rest of the snapshot.
const snapshotSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      links: z.array(z.object({ id: z.string(), url: z.string(), title: z.string().optional() })),
    }),
  ),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export interface Target {
  cardId: string;
  cardTitle: string;
  linkId: string;
  url: string;
  oldTitle?: string;
}

export type Outcome =
  | { kind: "update"; title: string; via: "fetch" | "decode" }
  | { kind: "unchanged" }
  | { kind: "kept"; reason: string };

export type FetchTitle = (url: string) => Promise<{ title?: string; reason?: string }>;

/**
 * True when a stored title is worth replacing: missing; one `usableTitle` would
 * reject or rewrite (raw `&#x1ee2;` entities, an interstitial, the bare brand
 * word); or the hostname the route used to return on a failed fetch.
 */
export function needsTitle(url: string, title: string | undefined): boolean {
  if (!title) return true;
  if (usableTitle(title, shortLabelFor(url)) !== title) return true;
  const host = new URL(url).hostname;
  return title === host || title === host.replace(/^www\./, "");
}

/** Every link that wants a page title (`wantsUnfurl`) and, unless `all`, lacks a good one. */
export function planTargets(snapshot: Snapshot, { all = false } = {}): Target[] {
  const targets: Target[] = [];
  for (const card of snapshot.cards) {
    for (const link of card.links) {
      if (!wantsUnfurl(link.url)) continue;
      if (!all && !needsTitle(link.url, link.title)) continue;
      targets.push({
        cardId: card.id,
        cardTitle: card.title,
        linkId: link.id,
        url: link.url,
        oldTitle: link.title,
      });
    }
  }
  return targets;
}

/**
 * Decide what a link's title becomes. A fetched title wins. When the fetch
 * yields nothing, a stored title that only needed entity decoding is repaired
 * in place; anything else keeps what it has (there is no command to clear a
 * title, and a stale one beats none).
 */
export async function resolveTitle(target: Target, fetchTitle: FetchTitle): Promise<Outcome> {
  const fetched = await fetchTitle(target.url);
  if (fetched.title) {
    return fetched.title === target.oldTitle
      ? { kind: "unchanged" }
      : { kind: "update", title: fetched.title, via: "fetch" };
  }
  const repaired = usableTitle(target.oldTitle, shortLabelFor(target.url));
  if (repaired && repaired !== target.oldTitle) {
    return { kind: "update", title: repaired, via: "decode" };
  }
  return { kind: "kept", reason: fetched.reason ?? "no usable title" };
}

/** Bot UA first, then a browser UA; never retries a blocked (SSRF) target. */
export const fetchTitleLive: FetchTitle = async (url) => {
  let reason = "no usable title";
  for (const userAgent of [UNFURL_USER_AGENT, BROWSER_USER_AGENT]) {
    try {
      const result = await withTimeout(
        fetchHtml(normalizeUrl(url), { fetchImpl: fetch, lookup: defaultLookup, userAgent }),
        PER_ATTEMPT_TIMEOUT_MS,
      );
      if (result?.title) return { title: result.title };
      reason = result ? "no usable title" : "unreachable or non-2xx";
    } catch (error) {
      if (error instanceof UnfurlBlockedError) {
        // The guard reports an unresolvable host as "dns failure"; that is a dead link, not a block.
        const dead = error.message === "dns failure";
        return { reason: dead ? "host no longer resolves" : `blocked (${error.message})` };
      }
      reason = `fetch failed (${(error as Error).name})`;
    }
  }
  return { reason };
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "Timeout" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function callCommand(
  api: string,
  token: string,
  name: string,
  body: object,
): Promise<unknown> {
  const res = await fetch(`${api}/api/commands/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error(
      "401: BOARDLY_TOKEN is missing, invalid or expired (access tokens last 15 minutes)",
    );
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { result: unknown }).result;
}

const USAGE = "usage: backfill-link-titles [--apply] [--all]";

async function main(argv: string[]): Promise<void> {
  const args = argv.filter((arg) => arg !== "--");
  const unknown = args.filter((arg) => arg !== "--apply" && arg !== "--all");
  if (unknown.length > 0) throw new Error(`unknown argument ${unknown.join(" ")}\n${USAGE}`);
  const apply = args.includes("--apply");
  const all = args.includes("--all");

  const api = (process.env.BOARDLY_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
  const token = process.env.BOARDLY_TOKEN;
  if (!token) throw new Error(`BOARDLY_TOKEN is required\n${USAGE}`);

  const snapshot = snapshotSchema.parse(await callCommand(api, token, "exportBoard", {}));
  const targets = planTargets(snapshot, { all });
  console.log(`${api}: ${targets.length} link(s) to check${all ? " (--all)" : ""}`);

  const outcomes = await mapPool(targets, CONCURRENCY, (t) => resolveTitle(t, fetchTitleLive));

  const counts = { update: 0, unchanged: 0, kept: 0, failed: 0 };
  for (const [index, target] of targets.entries()) {
    const outcome = outcomes[index]!;
    const old = target.oldTitle === undefined ? "(none)" : JSON.stringify(target.oldTitle);
    console.log(`\n${target.cardTitle}\n  ${target.url}`);
    if (outcome.kind === "update") {
      console.log(`  update (${outcome.via}): ${old} -> ${JSON.stringify(outcome.title)}`);
      if (apply) {
        try {
          await callCommand(api, token, "updateLinkTitle", {
            cardId: target.cardId,
            linkId: target.linkId,
            title: outcome.title,
          });
        } catch (error) {
          counts.failed++;
          console.log(`  WRITE FAILED: ${(error as Error).message}`);
          continue;
        }
      }
      counts.update++;
    } else if (outcome.kind === "unchanged") {
      counts.unchanged++;
      console.log(`  unchanged: ${old}`);
    } else {
      counts.kept++;
      console.log(`  kept ${old}: ${outcome.reason}`);
    }
  }

  const verb = apply ? "updated" : "would update";
  console.log(
    `\n${verb} ${counts.update}, unchanged ${counts.unchanged}, kept ${counts.kept}` +
      (counts.failed ? `, write failures ${counts.failed}` : ""),
  );
  if (!apply && counts.update > 0) console.log("dry run: rerun with --apply to write");
  if (counts.failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
