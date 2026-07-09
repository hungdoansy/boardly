// @boardly/server — Fastify + (later) Hocuspocus + Drizzle sync/API server.
// Unit 3.1: boots Fastify with a /health check against Postgres.
import { buildServer } from "./app";
import { loadConfig } from "./config";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(`[boardly-server] ${(error as Error).message}`);
    process.exit(1);
  }

  const app = buildServer({ config });
  try {
    const address = await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`[boardly-server] listening on ${address}`);
  } catch (error) {
    console.error("[boardly-server] failed to start:", error);
    await app.close();
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}

void main();
