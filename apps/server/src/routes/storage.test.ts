import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { generateTokenKeys, signAccessToken, type TokenKeys } from "../auth/tokens";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { users } from "../db/schema";
import { dirSizeBytes, storageRoutes } from "./storage";

// ---------------------------------------------------------------------------
// Pure: recursive directory sizing (always runs — no db)
// ---------------------------------------------------------------------------

describe("dirSizeBytes", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("returns 0 for a missing directory", async () => {
    expect(await dirSizeBytes(join(tmpdir(), `nope-${randomUUID()}`))).toBe(0);
  });

  it("sums regular files, including nested ones", async () => {
    const dir = await mkdtemp(join(tmpdir(), "boardly-size-"));
    dirs.push(dir);
    await writeFile(join(dir, "a.bin"), Buffer.alloc(100));
    await writeFile(join(dir, "b.bin"), Buffer.alloc(23));
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "c.bin"), Buffer.alloc(7));
    expect(await dirSizeBytes(dir)).toBe(130);
  });
});

// ---------------------------------------------------------------------------
// Route (integration, real db). Skipped unless DATABASE_URL is set.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)("GET /api/storage (integration, real db)", () => {
  let handle: DbHandle;
  let keys: TokenKeys;
  const tmpDirs: string[] = [];

  const buildApp = async (uploadsDir: string): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false });
    await app.register(storageRoutes, {
      db: handle.db,
      keys,
      uploadsDir,
      databaseLimitBytes: 1_073_741_824,
      uploadsLimitBytes: 5_368_709_120,
    });
    await app.ready();
    return app;
  };

  const bearer = async (): Promise<string> => {
    const [u] = await handle.db
      .insert(users)
      .values({ email: `stor-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    return `Bearer ${await signAccessToken(keys, { sub: u!.id }, 900)}`;
  };

  beforeAll(async () => {
    handle = createDb(DATABASE_URL!);
    await runMigrations(handle.db);
    keys = await generateTokenKeys();
  });

  afterAll(async () => {
    await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
    await handle?.pool.end();
  });

  it("requires Bearer (401)", async () => {
    const app = await buildApp(await mkdtemp(join(tmpdir(), "boardly-stor-")));
    const res = await app.inject({ method: "GET", url: "/api/storage" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("reports db size and files size against the configured caps", async () => {
    const dir = await mkdtemp(join(tmpdir(), "boardly-stor-"));
    tmpDirs.push(dir);
    await writeFile(join(dir, "one"), Buffer.alloc(500));
    const app = await buildApp(dir);

    const res = await app.inject({
      method: "GET",
      url: "/api/storage",
      headers: { authorization: await bearer() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      database: { usedBytes: number; limitBytes: number };
      files: { usedBytes: number; limitBytes: number };
    };
    expect(body.database.usedBytes).toBeGreaterThan(0);
    expect(body.database.limitBytes).toBe(1_073_741_824);
    expect(body.files.usedBytes).toBe(500);
    expect(body.files.limitBytes).toBe(5_368_709_120);
    await app.close();
  });

  it("reports 0 files when the uploads dir does not exist yet", async () => {
    const app = await buildApp(join(tmpdir(), `boardly-stor-missing-${randomUUID()}`));
    const res = await app.inject({
      method: "GET",
      url: "/api/storage",
      headers: { authorization: await bearer() },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { files: { usedBytes: number } }).files.usedBytes).toBe(0);
    await app.close();
  });
});
