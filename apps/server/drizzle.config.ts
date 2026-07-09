import { defineConfig } from "drizzle-kit";

// `generate` (offline, from schema.ts) + `migrate` (at boot) — never `push` —
// so migrations are committed, auditable, and re-runnable.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://boardly:boardly@localhost:5433/boardly",
  },
});
