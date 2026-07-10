import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { Pool } from "pg";

import { authRoutes } from "./auth/routes";
import type { AuthService } from "./auth/service";
import type { TokenKeys } from "./auth/tokens";
import type { ServerConfig } from "./config";
import type { Database } from "./db/client";
import { boardRoutes } from "./routes/boards";
import { ticketRoutes } from "./routes/ticket";
import { unfurlRoutes } from "./routes/unfurl";
import type { TicketStore } from "./sync/ticket-store";

export interface BuildServerOptions {
  config: ServerConfig;
  /** Inject a pool in tests; otherwise one is created from `DATABASE_URL`. */
  pool?: Pool;
  /** When provided, the /auth/* routes are mounted. */
  authService?: AuthService;
  /** Drizzle client — required (with `ticketStore` + `keys`) for /sync/ticket. */
  database?: Database;
  /** Shared WS ticket store — mounts /sync/ticket when present with `database` + `keys`. */
  ticketStore?: TicketStore;
  /** Access-token keys for verifying Bearer on /sync/ticket. */
  keys?: TokenKeys;
}

/**
 * Build the Fastify app (no `.listen`) so tests can drive it via `inject()`.
 * Owns a pg pool for liveness checks; auth routes mount when an `authService`
 * is supplied. Later units layer the Yjs sync endpoints on top.
 */
export function buildServer({
  config,
  pool,
  authService,
  database,
  ticketStore,
  keys,
}: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const db = pool ?? new Pool({ connectionString: config.DATABASE_URL });

  // Credentialed CORS: only the configured web origins may call the API and
  // receive the httpOnly refresh cookie. `credentials:true` forbids `*`, so the
  // allow-list is explicit.
  const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );
  void app.register(cors, {
    credentials: true,
    origin(origin, cb) {
      // Same-origin / non-browser requests (no Origin header) are allowed.
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      cb(null, false);
    },
  });

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

  if (authService) {
    void app.register(authRoutes, { service: authService, config });
  }

  if (database && ticketStore && keys) {
    void app.register(ticketRoutes, { db: database, ticketStore, keys });
  }

  if (database && keys) {
    void app.register(boardRoutes, { db: database, keys });
  }

  if (database) {
    void app.register(unfurlRoutes, { db: database });
  }

  return app;
}
