// @boardly/server — Fastify + (later) Hocuspocus + Drizzle sync/API server.
// Unit 3.1: /health against Postgres. Unit 3.2: run migrations at boot.
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrate";

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

  const app = buildServer({ config, pool });
  try {
    const address = await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`[boardly-server] listening on ${address}`);
  } catch (error) {
    console.error("[boardly-server] failed to start:", error);
    await app.close();
    await pool.end();
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app
        .close()
        .then(() => pool.end())
        .then(() => process.exit(0));
    });
  }
}

void main();
