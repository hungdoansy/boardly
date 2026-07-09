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
