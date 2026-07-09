import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "./app";
import { loadConfig } from "./config";

// Requires a reachable Postgres (see docker-compose.yml). Skipped unless
// DATABASE_URL is set, so the default `pnpm -r test` stays db-free; run with:
//   docker compose up -d db
//   DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
//     pnpm --filter @boardly/server test
const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("GET /health (integration, real db)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildServer({ config: loadConfig() });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns ok and reports the db is up", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", db: "up" });
  });
});
