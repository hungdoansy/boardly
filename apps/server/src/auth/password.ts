import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1). @node-rs/argon2
// defaults `algorithm` to Argon2id (the const enum can't be imported as a value
// under verbatimModuleSyntax), which the tests assert on the `$argon2id$` prefix.
// The salt is generated per-hash and embedded in the PHC output string.
const OPTIONS = {
  memoryCost: 19_456, // KiB == 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Constant-time verify (argon2's own comparison). Never throws on mismatch. */
export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password);
  } catch {
    // Malformed/foreign hash string → treat as a failed verification.
    return false;
  }
}
