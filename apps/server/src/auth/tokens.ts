import { createHash, randomBytes } from "node:crypto";

import { type CryptoKey, SignJWT, exportPKCS8, exportSPKI, generateKeyPair, jwtVerify } from "jose";

// EdDSA (Ed25519) access tokens. Pinning the algorithm on verify is what makes
// `alg:none` (and any other alg) rejected outright.
const ALG = "EdDSA";
const ISSUER = "boardly";
const AUDIENCE = "boardly-app";

export interface TokenKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

export interface AccessClaims {
  sub: string;
}

/** Generate an ephemeral Ed25519 keypair (extractable, so it can be exported). */
export async function generateTokenKeys(): Promise<TokenKeys> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  return { privateKey, publicKey };
}

/** Export a keypair to PEM (for persisting across restarts — see config note). */
export async function exportTokenKeys(
  keys: TokenKeys,
): Promise<{ privatePem: string; publicPem: string }> {
  return {
    privatePem: await exportPKCS8(keys.privateKey),
    publicPem: await exportSPKI(keys.publicKey),
  };
}

export async function signAccessToken(
  keys: TokenKeys,
  claims: AccessClaims,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(keys.privateKey);
}

/**
 * Verify an access token. Rejects tampered signatures, expired tokens, wrong
 * issuer/audience, and any algorithm other than EdDSA (so `alg:none` fails).
 */
export async function verifyAccessToken(keys: TokenKeys, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALG],
  });
  if (typeof payload.sub !== "string") throw new Error("token missing subject");
  return { sub: payload.sub };
}

/** A high-entropy opaque refresh token (never a JWT). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 of a refresh token; only the hash is stored at rest. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
