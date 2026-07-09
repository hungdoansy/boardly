import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";

import type { ServerConfig } from "./config";

export interface BuildServerOptions {
  config: ServerConfig;
  /** Inject a pool in tests; otherwise one is created from `DATABASE_URL`. */
  pool?: Pool;
}

/**
 * Build the Fastify app (no `.listen`) so tests can drive it via `inject()`.
 * Owns a pg pool for liveness checks; later units (3.2+) layer Drizzle, auth,
 * and the Yjs sync endpoints on top.
 */
export function buildServer({ config, pool }: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const db = pool ?? new Pool({ connectionString: config.DATABASE_URL });

  // Only close the pool we created; a caller-supplied pool is theirs to manage.
  if (!pool) {
    app.addHook("onClose", async () => {
      await db.end();
    });
  }

  app.get("/health", async (_request, reply) => {
    try {
      await db.query("SELECT 1");
      return { status: "ok", db: "up" };
    } catch (error) {
      // Log the real error server-side only; the raw message can carry the
      // connection string / internal host details, so never return it.
      console.error("[boardly-server] health check db query failed:", error);
      reply.status(503);
      return { status: "degraded", db: "down" };
    }
  });

  return app;
}
