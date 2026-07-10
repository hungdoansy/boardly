// @boardly/server — Fastify + (later) Hocuspocus + Drizzle sync/API server.
// Unit 3.1: /health against Postgres. Unit 3.2: run migrations at boot.
import { buildServer } from "./app";
import { createAuthService } from "./auth/service";
import { generateTokenKeys } from "./auth/tokens";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";
import { attachSyncServer, createSyncServer } from "./sync/hocuspocus";
import { createTicketStore } from "./sync/ticket-store";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`[boardly-server] ${(error as Error).message}`);
    process.exit(1);
  }

  const { pool, db } = createDb(config.DATABASE_URL);
  try {
    await runMigrations(db);
    console.log("[boardly-server] migrations applied");
  } catch (error) {
    console.error("[boardly-server] migration failed:", error);
    await pool.end();
    process.exit(1);
  }

  // Ephemeral JWT signing keys: access tokens are short-lived and refresh
  // tokens are opaque + DB-backed, so a key rotation on restart only forces a
  // silent token refresh. Persisting keys for multi-instance is a follow-up.
  const keys = await generateTokenKeys();
  const authService = createAuthService({ db, keys, config });

  // Yjs sync server (Unit 3.5): shares the ticket store with the (Unit 3.6)
  // ticket endpoint and rides the same HTTP server on /sync.
  const ticketStore = createTicketStore();
  const syncServer = createSyncServer({ db, ticketStore, config });

  const app = buildServer({
    config,
    pool,
    authService,
    database: db,
    ticketStore,
    keys,
    hocuspocus: syncServer.hocuspocus,
  });
  let detachSync: (() => Promise<void>) | undefined;
  try {
    const address = await app.listen({ port: config.PORT, host: config.HOST });
    detachSync = attachSyncServer(app.server, syncServer);
    console.log(`[boardly-server] listening on ${address} (sync on /sync)`);
  } catch (error) {
    console.error("[boardly-server] failed to start:", error);
    await app.close();
    await pool.end();
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void (async () => {
        await detachSync?.();
        await app.close();
        await pool.end();
        process.exit(0);
      })();
    });
  }
}

void main();
