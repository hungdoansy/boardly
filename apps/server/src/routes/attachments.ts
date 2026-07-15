import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import multipart from "@fastify/multipart";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { attachments } from "../db/schema";

/** Image MIME types we accept. Both the declared header *and* the magic bytes must match. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detect an image type from a buffer's leading bytes, returning our canonical
 * MIME string or `null` if it is not one of the four allowed formats. Pure and
 * exported for unit testing. We never trust the client-declared `content-type`
 * on its own — the sniffed type must equal it.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 && // G
    buf[1] === 0x49 && // I
    buf[2] === 0x46 && // F
    buf[3] === 0x38 && // 8
    (buf[4] === 0x37 || buf[4] === 0x39) && // 7 | 9
    buf[5] === 0x61 // a
  ) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Map an `@fastify/multipart` error to a client-safe status. */
function replyForMultipartError(err: unknown, reply: FastifyReply): FastifyReply {
  const code = (err as { code?: string }).code;
  if (code === "FST_REQ_FILE_TOO_LARGE") return reply.code(413).send({ error: "file too large" });
  if (code === "FST_FILES_LIMIT") return reply.code(400).send({ error: "too many files" });
  return reply.code(400).send({ error: "invalid request" });
}

export interface AttachmentRoutesOptions {
  db: Database;
  keys: TokenKeys;
  /** Absolute or cwd-relative directory where image bytes are written. */
  uploadsDir: string;
  /** Per-file upload cap in bytes. */
  maxUploadBytes: number;
}

/**
 * `POST /api/attachments` (multipart, Bearer) stores one image and returns its
 * id; `GET /attachments/:id` (Bearer) streams the bytes back to the owner. Bytes
 * live on disk under `uploadsDir`; only metadata lives in Postgres. Uploads are
 * validated by declared MIME **and** magic bytes; a stored image is served only
 * to the user who owns it (404 otherwise — existence is never revealed).
 */
export async function attachmentRoutes(
  app: FastifyInstance,
  opts: AttachmentRoutesOptions,
): Promise<void> {
  const { db, keys, uploadsDir, maxUploadBytes } = opts;

  await app.register(multipart, { limits: { fileSize: maxUploadBytes, files: 1 } });

  app.post("/api/attachments", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    let part;
    let buffer: Buffer;
    try {
      part = await request.file();
      if (!part) return reply.code(400).send({ error: "no file provided" });
      // Always drain the stream into a (capped) buffer so no request hangs, even
      // when we go on to reject the type below.
      buffer = await part.toBuffer();
    } catch (err) {
      return replyForMultipartError(err, reply);
    }
    if (part.file.truncated) return reply.code(413).send({ error: "file too large" });

    // Declared MIME must be allowed AND the magic bytes must confirm it.
    const detected = sniffImageMime(buffer);
    if (!ALLOWED_MIME.has(part.mimetype) || detected !== part.mimetype) {
      return reply.code(415).send({ error: "unsupported media type" });
    }

    const id = randomUUID();
    const filePath = join(uploadsDir, id);
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(filePath, buffer);
    try {
      await db.insert(attachments).values({
        id,
        userId,
        mimeType: part.mimetype,
        sizeBytes: buffer.length,
        originalName: part.filename ? part.filename.slice(0, 255) : null,
      });
    } catch (err) {
      // Don't leave an orphan file if the metadata insert fails.
      await unlink(filePath).catch(() => {});
      throw err;
    }

    return reply.code(201).send({ id });
  });

  app.get<{ Params: { id: string } }>("/attachments/:id", async (request, reply) => {
    const userId = await authenticateBearer(request, keys);
    if (!userId) return reply.code(401).send({ error: "unauthorized" });

    const { id } = request.params;
    if (!UUID_RE.test(id)) return reply.code(404).send({ error: "not found" });

    const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    // 404 for both "no such id" and "not your attachment" — never confirm the
    // existence of another user's attachment.
    if (!row || row.userId !== userId) return reply.code(404).send({ error: "not found" });

    const filePath = join(uploadsDir, row.id);
    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      console.error("[boardly-server] attachment row present but file missing:", row.id);
      return reply.code(404).send({ error: "not found" });
    }

    reply.header("content-type", row.mimeType);
    reply.header("content-length", fileStat.size);
    // Bytes are immutable per id, so cache hard (but privately — it's auth-gated).
    reply.header("cache-control", "private, max-age=31536000, immutable");
    return reply.send(createReadStream(filePath));
  });
}
