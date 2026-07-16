import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateTokenKeys, signAccessToken, type TokenKeys } from "../auth/tokens";
import { createDb, type DbHandle } from "../db/client";
import { runMigrations } from "../db/migrate";
import { attachments, users } from "../db/schema";
import { attachmentRoutes, sniffImageMime } from "./attachments";

// Minimal buffers that carry each format's magic bytes (enough for the sniffer;
// not full valid images).
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("boardly-test-png-payload"),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("jpeg")]);
const GIF = Buffer.from("GIF89a-and-some-bytes");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP...."),
]);
const PDF = Buffer.from("%PDF-1.4\n%boardly");

// ---------------------------------------------------------------------------
// Pure: magic-byte sniffing (always runs — no db)
// ---------------------------------------------------------------------------

describe("sniffImageMime", () => {
  it("detects each allowed image format from its magic bytes", () => {
    expect(sniffImageMime(PNG)).toBe("image/png");
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(GIF)).toBe("image/gif");
    expect(sniffImageMime(WEBP)).toBe("image/webp");
  });

  it("returns null for non-image / truncated buffers", () => {
    expect(sniffImageMime(PDF)).toBeNull();
    expect(sniffImageMime(Buffer.from([0x89, 0x50]))).toBeNull(); // too short for PNG
    expect(sniffImageMime(Buffer.from("RIFFxxxxAVI "))).toBeNull(); // RIFF but not WEBP
  });
});

// ---------------------------------------------------------------------------
// Routes (integration, real db). Skipped unless DATABASE_URL is set.
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;

/** Hand-build a multipart/form-data body with a single file field. */
function multipartFile(content: Buffer, filename: string, contentType: string) {
  const boundary = `----boardly${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, content, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

/** A multipart body with only a text field — no file part. */
function multipartNoFile() {
  const boundary = `----boardly${randomUUID()}`;
  const body = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="note"\r\n\r\n` +
      `hello\r\n--${boundary}--\r\n`,
  );
  return { body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe.skipIf(!DATABASE_URL)("attachment routes (integration, real db)", () => {
  let handle: DbHandle;
  let keys: TokenKeys;

  const buildApp = async (
    uploadsDir: string,
    maxUploadBytes = 1_000_000,
  ): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false });
    await app.register(attachmentRoutes, { db: handle.db, keys, uploadsDir, maxUploadBytes });
    await app.ready();
    return app;
  };

  const newUser = async (): Promise<string> => {
    const [u] = await handle.db
      .insert(users)
      .values({ email: `att-${randomUUID()}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    return u!.id;
  };

  const bearer = async (userId: string): Promise<string> =>
    `Bearer ${await signAccessToken(keys, { sub: userId }, 900)}`;

  const tmpDirs: string[] = [];
  const freshDir = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "boardly-att-"));
    tmpDirs.push(dir);
    return dir;
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

  it("uploads a PNG → 201, writes the file, and records metadata", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir);
    const userId = await newUser();
    const { body, headers } = multipartFile(PNG, "shot.png", "image/png");

    const res = await app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { ...headers, authorization: await bearer(userId) },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);

    // File on disk is byte-identical.
    expect(Buffer.compare(await readFile(join(dir, id)), PNG)).toBe(0);

    // Metadata row is correct and owned by the uploader.
    const [row] = await handle.db.select().from(attachments).where(eq(attachments.id, id));
    expect(row?.userId).toBe(userId);
    expect(row?.mimeType).toBe("image/png");
    expect(row?.sizeBytes).toBe(PNG.length);
    expect(row?.originalName).toBe("shot.png");

    await app.close();
  });

  it("serves an owned attachment → 200 with correct content-type and identical bytes", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir);
    const userId = await newUser();
    const auth = await bearer(userId);
    const upload = multipartFile(JPEG, "p.jpg", "image/jpeg");
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { ...upload.headers, authorization: auth },
        payload: upload.body,
      })
    ).json() as { id: string };

    const res = await app.inject({
      method: "GET",
      url: `/attachments/${id}`,
      headers: { authorization: auth },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(Buffer.compare(res.rawPayload, JPEG)).toBe(0);

    await app.close();
  });

  it("requires Bearer on upload and serve (401)", async () => {
    const app = await buildApp(await freshDir());
    const upload = multipartFile(PNG, "a.png", "image/png");
    const up = await app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: upload.headers,
      payload: upload.body,
    });
    expect(up.statusCode).toBe(401);

    const down = await app.inject({ method: "GET", url: `/attachments/${randomUUID()}` });
    expect(down.statusCode).toBe(401);
    await app.close();
  });

  it("returns 404 when another user requests the attachment (no existence leak)", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir);
    const owner = await newUser();
    const other = await newUser();
    const upload = multipartFile(PNG, "a.png", "image/png");
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { ...upload.headers, authorization: await bearer(owner) },
        payload: upload.body,
      })
    ).json() as { id: string };

    const res = await app.inject({
      method: "GET",
      url: `/attachments/${id}`,
      headers: { authorization: await bearer(other) },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 404 for an unknown id, a malformed id, and a missing file", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir);
    const userId = await newUser();
    const auth = await bearer(userId);

    // Unknown (well-formed) id.
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/attachments/${randomUUID()}`,
          headers: { authorization: auth },
        })
      ).statusCode,
    ).toBe(404);

    // Malformed id → 404, not a 500 from a bad uuid cast.
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/attachments/not-a-uuid",
          headers: { authorization: auth },
        })
      ).statusCode,
    ).toBe(404);

    // Row exists but the file was removed from disk → 404.
    const upload = multipartFile(PNG, "a.png", "image/png");
    const { id } = (
      await app.inject({
        method: "POST",
        url: "/api/attachments",
        headers: { ...upload.headers, authorization: auth },
        payload: upload.body,
      })
    ).json() as { id: string };
    await rm(join(dir, id));
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/attachments/${id}`,
          headers: { authorization: auth },
        })
      ).statusCode,
    ).toBe(404);

    await app.close();
  });

  it("rejects a non-image (declared image, PDF magic bytes) → 415, no file, no row", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir);
    const userId = await newUser();
    const upload = multipartFile(PDF, "evil.png", "image/png");

    const res = await app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { ...upload.headers, authorization: await bearer(userId) },
      payload: upload.body,
    });
    expect(res.statusCode).toBe(415);

    const rows = await handle.db.select().from(attachments).where(eq(attachments.userId, userId));
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it("rejects a file over the cap → 413", async () => {
    const dir = await freshDir();
    const app = await buildApp(dir, 64); // 64-byte cap
    const userId = await newUser();
    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(256, 1),
    ]);
    const upload = multipartFile(big, "big.png", "image/png");

    const res = await app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { ...upload.headers, authorization: await bearer(userId) },
      payload: upload.body,
    });
    expect(res.statusCode).toBe(413);
    await app.close();
  });

  it("rejects a request with no file part → 400", async () => {
    const app = await buildApp(await freshDir());
    const userId = await newUser();
    const { body, headers } = multipartNoFile();
    const res = await app.inject({
      method: "POST",
      url: "/api/attachments",
      headers: { ...headers, authorization: await bearer(userId) },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
