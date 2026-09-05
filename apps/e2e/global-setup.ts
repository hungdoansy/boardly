import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHUNKS = path.join(HERE, "..", "web", "out", "_next", "static", "chunks");

/** The API origin this suite's `webServer` block actually starts. */
const EXPECTED = "http://localhost:8787";

/**
 * Fail before a single test runs if `apps/web/out` was built against a different
 * API origin than the one this suite starts.
 *
 * `NEXT_PUBLIC_API_URL` is **baked into the bundle at build time**, and
 * `apps/web/.env.production` — which `next build` auto-loads — points it at
 * `http://localhost:8788`, the Dockerized production stack. So a plain
 * `pnpm --filter @boardly/web build` (or `pnpm -r build`) silently produces an
 * `out/` that talks to production. Nothing about the run looks wrong: the e2e
 * server starts on 8787, the browser connects, tests sign up and pass — against
 * the production database. This guard is here because that failure is invisible
 * from the outside, and it writes to real data.
 *
 * Build for this suite with the origin set explicitly:
 *
 *   NEXT_PUBLIC_API_URL=http://localhost:8787 pnpm --filter @boardly/web build
 */
export default async function assertBuildTargetsTestApi(): Promise<void> {
  let files: string[];
  try {
    files = (await readdir(CHUNKS)).filter((f) => f.endsWith(".js"));
  } catch {
    throw new Error(
      `No static export at ${CHUNKS}.\n` +
        `Build it first:\n  NEXT_PUBLIC_API_URL=${EXPECTED} pnpm --filter @boardly/web build`,
    );
  }

  const origins = new Set<string>();
  for (const file of files) {
    const source = await readFile(path.join(CHUNKS, file), "utf8");
    for (const match of source.matchAll(/https?:\/\/localhost:\d+/g)) origins.add(match[0]);
  }

  const wrong = [...origins].filter((origin) => origin !== EXPECTED && /:87\d\d$/.test(origin));
  if (wrong.length > 0) {
    throw new Error(
      `apps/web/out is built against ${wrong.join(", ")}, not ${EXPECTED}.\n` +
        `That points the browser at another backend — 8788 is the Docker PRODUCTION stack, ` +
        `and this suite would sign up and write boards into its database.\n` +
        `Rebuild with the origin set explicitly:\n` +
        `  NEXT_PUBLIC_API_URL=${EXPECTED} pnpm --filter @boardly/web build`,
    );
  }
}
