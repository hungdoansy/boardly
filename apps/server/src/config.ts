import { z } from "zod";

/**
 * Server configuration, validated at boot. `DATABASE_URL` is required — the
 * process refuses to start without it (Unit 3.1 edge case) rather than failing
 * later on the first query.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Comma-separated web origins allowed to call the API with credentials (CORS).
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // Auth (Unit 3.3).
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900), // 15 min
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // Attachments (image uploads in card descriptions). `UPLOADS_DIR` points at a
  // Docker volume in prod (`/data/uploads`) and a local folder in dev
  // (`./data/uploads`) — one code path, different value. `MAX_UPLOAD_BYTES` is
  // the per-file cap; the two `*_LIMIT_BYTES` are display caps for the Settings
  // storage meter.
  UPLOADS_DIR: z.string().min(1).default("./data/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760), // 10 MiB
  DATABASE_LIMIT_BYTES: z.coerce.number().int().positive().default(1_073_741_824), // 1 GiB
  UPLOADS_LIMIT_BYTES: z.coerce.number().int().positive().default(5_368_709_120), // 5 GiB
});

export type ServerConfig = z.infer<typeof schema>;

/** Parse+validate env, throwing a single readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server configuration: ${details}`);
  }
  return parsed.data;
}
