import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, type DbHandle } from "./client";
import { runMigrations } from "./migrate";
import { yjsDocuments } from "./schema";

// Real-db integration (see docker-compose.yml). Skipped unless DATABASE_URL is
// set, so the default `pnpm -r test` stays db-free. Run with:
//   docker compose up -d db
//   DATABASE_URL=postgres://boardly:boardly@localhost:5433/boardly \
//     pnpm --filter @boardly/server test
const DATABASE_URL = process.env.DATABASE_URL;

const EXPECTED_TABLES = [
  "users",
  "refresh_tokens",
  "boards",
  "yjs_documents",
  "link_metadata_cache",
];

describe.skipIf(!DATABASE_URL)("migrations + schema (integration, real db)", () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  it("applies migrations, creating every table", async () => {
    await runMigrations(handle.db);
    const { rows } = await handle.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const table of EXPECTED_TABLES) expect(names.has(table)).toBe(true);
  });

  it("is idempotent on re-run (applied-migration count is stable)", async () => {
    await runMigrations(handle.db);
    const before = await handle.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    await runMigrations(handle.db); // second run: no-op
    const after = await handle.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("round-trips a Uint8Array through the bytea column", async () => {
    await runMigrations(handle.db);
    const docName = "test:bytea-roundtrip";
    const state = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);

    await handle.db.delete(yjsDocuments).where(eq(yjsDocuments.docName, docName));
    await handle.db.insert(yjsDocuments).values({ docName, state });

    const [row] = await handle.db
      .select()
      .from(yjsDocuments)
      .where(eq(yjsDocuments.docName, docName));
    expect(row).toBeDefined();
    expect(row?.state).toBeInstanceOf(Uint8Array);
    expect(Array.from(row!.state)).toEqual(Array.from(state));

    await handle.db.delete(yjsDocuments).where(eq(yjsDocuments.docName, docName));
  });
});
