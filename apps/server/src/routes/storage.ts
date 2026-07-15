import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";

/**
 * Total size of all regular files under `dir` (recursively), in bytes. Reflects
 * true disk usage — including any abandoned-upload orphans, since there is no
 * GC. A missing directory (nothing uploaded yet) is `0`. Exported for testing.
 */
export async function dirSizeBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // directory doesn't exist yet
  }
  let total = 0;
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirSizeBytes(full);
    } else if (entry.isFile()) {
      try {
        total += (await stat(full)).size;
      } catch {
        // file vanished between readdir and stat — ignore
      }
    }
  }
  return total;
}

export interface StorageRoutesOptions {
  db: Database;
  keys: TokenKeys;
  uploadsDir: string;
  databaseLimitBytes: number;
  uploadsLimitBytes: number;
}

/**
 * `GET /api/storage` — report database size (`pg_database_size`) and total
 * uploaded-file size (disk walk of `UPLOADS_DIR`) against the configured display
 * caps, for the Settings storage meter. Bearer-gated. This is a single-user
 * tool, so usage is board-wide (not partitioned per user).
 */
export async function storageRoutes(
  app: FastifyInstance,
  opts: StorageRoutesOptions,
): Promise<void> {
  const { db, keys, uploadsDir, databaseLimitBytes, uploadsLimitBytes } = opts;

  app.get("/api/storage", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const result = await db.execute<{ size: string }>(
      sql`select pg_database_size(current_database()) as size`,
    );
    const databaseUsed = Number(result.rows[0]?.size ?? 0);
    const filesUsed = await dirSizeBytes(uploadsDir);

    return reply.send({
      database: { usedBytes: databaseUsed, limitBytes: databaseLimitBytes },
      files: { usedBytes: filesUsed, limitBytes: uploadsLimitBytes },
    });
  });
}
