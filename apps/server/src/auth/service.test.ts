import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../config";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { AuthError, type AuthService, createAuthService } from "./service";
import { generateTokenKeys } from "./tokens";

const DATABASE_URL = process.env.DATABASE_URL;
const email = (): string => `t-${randomUUID()}@example.com`;
const PASSWORD = "correct horse battery staple";

describe.skipIf(!DATABASE_URL)("auth service (integration, real db)", () => {
  let handle: DbHandle;
  let service: AuthService;

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
    const keys = await generateTokenKeys();
    const config = loadConfig({ DATABASE_URL, NODE_ENV: "test" });
    service = createAuthService({ db: handle.db, keys, config });
  });

  afterAll(async () => {
    await handle?.pool.end();
  });

  it("signup then login issues an access + refresh token", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    const session = await service.login(e, PASSWORD);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("signup is idempotent/uniform for a duplicate email (no throw, no takeover)", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    await expect(service.signup(e, "a-different-password")).resolves.toBeUndefined();
    // The original password still works; the duplicate signup did not overwrite it.
    await expect(service.login(e, PASSWORD)).resolves.toBeTruthy();
    await expect(service.login(e, "a-different-password")).rejects.toBeInstanceOf(AuthError);
  });

  it("returns the same generic error for unknown email and wrong password", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    const unknown = await service.login(email(), PASSWORD).catch((err) => err);
    const wrong = await service.login(e, "nope-nope-nope").catch((err) => err);
    expect(unknown).toBeInstanceOf(AuthError);
    expect(wrong).toBeInstanceOf(AuthError);
    expect((unknown as AuthError).message).toBe((wrong as AuthError).message);
    expect((unknown as AuthError).code).toBe("invalid_credentials");
  });

  it("rotates the refresh token: the new one works, the old one is invalid", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    const first = await service.login(e, PASSWORD);

    const rotated = await service.refresh(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // The rotated (new) token refreshes again.
    await expect(service.refresh(rotated.refreshToken)).resolves.toBeTruthy();
  });

  it("detects reuse of a rotated-out token and revokes the whole family", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    const first = await service.login(e, PASSWORD);
    const second = await service.refresh(first.refreshToken); // first is now rotated out

    // Reusing the old (revoked) token is treated as theft.
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(AuthError);

    // ...which revokes the entire family, so the "good" current token dies too.
    await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });

  it("logout revokes the family so the refresh token no longer works", async () => {
    const e = email();
    await service.signup(e, PASSWORD);
    const session = await service.login(e, PASSWORD);
    await service.logout(session.refreshToken);
    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(AuthError);
  });
});
