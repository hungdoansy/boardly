import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  pool: Pool;
  db: Database;
}

/** Create a pooled Drizzle client. Caller owns the pool's lifecycle (`pool.end`). */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { pool, db };
}
