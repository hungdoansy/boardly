import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { ServerConfig } from "../config";
import type { Database } from "../db/client";
import { refreshTokens, users } from "../db/schema";
import { hashPassword, verifyPassword } from "./password";
import { generateRefreshToken, hashRefreshToken, signAccessToken, type TokenKeys } from "./tokens";

export type AuthErrorCode = "invalid_credentials" | "invalid_token";

/** All client-facing auth failures use a generic message (no enumeration). */
export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(
      code === "invalid_credentials" ? "invalid email or password" : "invalid or expired token",
    );
    this.name = "AuthError";
  }
}

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthServiceDeps {
  db: Database;
  keys: TokenKeys;
  config: ServerConfig;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function createAuthService({ db, keys, config }: AuthServiceDeps) {
  // A real argon2id hash used to equalize timing when the email is unknown, so
  // login latency can't be used to enumerate accounts. Computed once.
  const decoyHashPromise = hashPassword(randomUUID());

  const refreshExpiry = (): Date =>
    new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  async function issueSession(userId: string, familyId: string): Promise<Session> {
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = refreshExpiry();
    await db.insert(refreshTokens).values({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
    });
    const accessToken = await signAccessToken(
      keys,
      { sub: userId },
      config.ACCESS_TOKEN_TTL_SECONDS,
    );
    return { userId, accessToken, refreshToken, refreshExpiresAt };
  }

  return {
    /** Create an account. Uniform response whether or not the email existed. */
    async signup(email: string, password: string): Promise<void> {
      const normalized = normalizeEmail(email);
      const passwordHash = await hashPassword(password); // always hash (uniform timing)
      await db.insert(users).values({ email: normalized, passwordHash }).onConflictDoNothing();
    },

    async login(email: string, password: string): Promise<Session> {
      const normalized = normalizeEmail(email);
      const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
      if (!user) {
        // Burn comparable time, then fail generically.
        await verifyPassword(await decoyHashPromise, password);
        throw new AuthError("invalid_credentials");
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) throw new AuthError("invalid_credentials");
      return issueSession(user.id, randomUUID());
    },

    /**
     * Rotate a refresh token. Reusing a token that was already rotated out
     * (revoked) is treated as theft: the entire token family is revoked.
     */
    async refresh(refreshToken: string): Promise<Session> {
      const tokenHash = hashRefreshToken(refreshToken);
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (!row) throw new AuthError("invalid_token");

      if (row.revokedAt !== null) {
        // Reuse detected → revoke every live token in the family.
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
        throw new AuthError("invalid_token");
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        throw new AuthError("invalid_token");
      }

      return db.transaction(async (tx) => {
        // Revoke only if still live (guards against a concurrent rotation).
        const revoked = await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
          .returning({ id: refreshTokens.id });
        if (revoked.length === 0) throw new AuthError("invalid_token");

        const refresh = generateRefreshToken();
        const refreshExpiresAt = refreshExpiry();
        await tx.insert(refreshTokens).values({
          userId: row.userId,
          tokenHash: hashRefreshToken(refresh),
          familyId: row.familyId,
          expiresAt: refreshExpiresAt,
        });
        const accessToken = await signAccessToken(
          keys,
          { sub: row.userId },
          config.ACCESS_TOKEN_TTL_SECONDS,
        );
        return { userId: row.userId, accessToken, refreshToken: refresh, refreshExpiresAt };
      });
    },

    /** Revoke the whole family behind a refresh token. Idempotent. */
    async logout(refreshToken: string): Promise<void> {
      const tokenHash = hashRefreshToken(refreshToken);
      const [row] = await db
        .select({ familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      if (!row) return;
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
