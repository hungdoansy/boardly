import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../app";
import { loadConfig } from "../config";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { createAuthService } from "./service";
import { generateTokenKeys } from "./tokens";

const DATABASE_URL = process.env.DATABASE_URL;
const email = (): string => `t-${randomUUID()}@example.com`;
const PASSWORD = "correct horse battery staple";

async function makeApp(overrides: Record<string, string> = {}): Promise<{
  app: FastifyInstance;
  handle: DbHandle;
}> {
  const handle = createDb(DATABASE_URL!);
  await runMigrations(handle.db);
  const keys = await generateTokenKeys();
  const config = loadConfig({ DATABASE_URL, NODE_ENV: "test", ...overrides });
  const authService = createAuthService({ db: handle.db, keys, config });
  const app = buildServer({ config, pool: handle.pool, authService });
  await app.ready();
  return { app, handle };
}

const cookieOf = (res: { cookies: { name: string; value: string }[] }): string | undefined =>
  res.cookies.find((c) => c.name === "boardly_refresh")?.value;

describe.skipIf(!DATABASE_URL)("auth routes (integration, real db)", () => {
  let app: FastifyInstance;
  let handle: DbHandle;

  beforeAll(async () => {
    ({ app, handle } = await makeApp());
  });

  afterAll(async () => {
    await app?.close();
    await handle?.pool.end();
  });

  it("signup → login sets an httpOnly refresh cookie and returns an access token", async () => {
    const e = email();
    const signup = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: e, password: PASSWORD },
    });
    expect(signup.statusCode).toBe(201);
    expect(signup.json()).toEqual({ ok: true });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().accessToken).toBeTruthy();
    // Web: refresh token is cookie-only, never in the JS-readable body.
    expect(login.json().refreshToken).toBeUndefined();
    const setCookie = login.cookies.find((c) => c.name === "boardly_refresh");
    expect(setCookie?.httpOnly).toBe(true);
    expect(setCookie?.sameSite?.toLowerCase()).toBe("lax");
    expect(setCookie?.value).toBeTruthy();
  });

  it("never returns the refresh token in the body, even with a spoofed client header", async () => {
    const e = email();
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: e, password: PASSWORD },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-boardly-client": "desktop" },
      payload: { email: e, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().refreshToken).toBeUndefined();
  });

  it("returns a generic 401 for a wrong password (no enumeration)", async () => {
    const e = email();
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: e, password: PASSWORD },
    });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("invalid email or password");
  });

  it("rejects malformed input with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "nope", password: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("refreshes via the cookie, rotates it, and logout clears it", async () => {
    const e = email();
    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: e, password: PASSWORD },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: PASSWORD },
    });
    const rt = cookieOf(login)!;

    const refreshed = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { boardly_refresh: rt },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().accessToken).toBeTruthy();
    const newRt = cookieOf(refreshed)!;
    expect(newRt).not.toBe(rt);

    const loggedOut = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: { boardly_refresh: newRt },
    });
    expect(loggedOut.statusCode).toBe(200);
    // Cookie cleared (empty value).
    expect(cookieOf(loggedOut)).toBe("");
    // And the token no longer refreshes.
    const dead = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { boardly_refresh: newRt },
    });
    expect(dead.statusCode).toBe(401);
  });

  it("rate-limits login after the configured number of attempts", async () => {
    const { app: limited, handle: h } = await makeApp({ LOGIN_RATE_MAX: "2" });
    try {
      const e = email();
      const body = {
        method: "POST" as const,
        url: "/auth/login",
        payload: { email: e, password: "x-wrong-1" },
      };
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await limited.inject(body)).statusCode);
      // First two are handled (401 wrong creds), the third is throttled.
      expect(codes[2]).toBe(429);
    } finally {
      await limited.close();
      await h.pool.end();
    }
  });
});
