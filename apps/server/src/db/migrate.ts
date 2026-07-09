import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./client";

// Committed SQL lives in apps/server/drizzle. From src/db (dev, tsx) or
// dist/db (built) the folder is two levels up either way.
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

/** Apply all pending migrations. Idempotent: already-applied ones are skipped. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}
