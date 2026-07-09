import { base64url } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  generateRefreshToken,
  generateTokenKeys,
  hashRefreshToken,
  signAccessToken,
  type TokenKeys,
  verifyAccessToken,
} from "./tokens";

let keys: TokenKeys;
let otherKeys: TokenKeys;

beforeAll(async () => {
  keys = await generateTokenKeys();
  otherKeys = await generateTokenKeys();
});

describe("access tokens (EdDSA JWT)", () => {
  it("round-trips the subject", async () => {
    const token = await signAccessToken(keys, { sub: "user-1" }, 900);
    const claims = await verifyAccessToken(keys, token);
    expect(claims.sub).toBe("user-1");
  });

  it("rejects a token signed by a different key", async () => {
    const token = await signAccessToken(otherKeys, { sub: "user-1" }, 900);
    await expect(verifyAccessToken(keys, token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signAccessToken(keys, { sub: "user-1" }, -10); // already expired
    await expect(verifyAccessToken(keys, token)).rejects.toThrow();
  });

  it("rejects an `alg:none` unsigned token", async () => {
    const header = base64url.encode(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = base64url.encode(
      JSON.stringify({ sub: "user-1", iss: "boardly", aud: "boardly-app" }),
    );
    const forged = `${header}.${payload}.`;
    await expect(verifyAccessToken(keys, forged)).rejects.toThrow();
  });

  it("rejects a tampered payload", async () => {
    const token = await signAccessToken(keys, { sub: "user-1" }, 900);
    const [h, , s] = token.split(".");
    const evil = base64url.encode(
      JSON.stringify({ sub: "admin", iss: "boardly", aud: "boardly-app" }),
    );
    await expect(verifyAccessToken(keys, `${h}.${evil}.${s}`)).rejects.toThrow();
  });
});

describe("refresh tokens", () => {
  it("generates distinct high-entropy tokens", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it("hashes deterministically and hides the raw token", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
