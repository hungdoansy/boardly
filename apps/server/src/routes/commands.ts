import { ImportError, commands, execute, getCommand, type CommandContext } from "@boardly/commands";
import type { Hocuspocus } from "@hocuspocus/server";
import type { FastifyError, FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { boardDocName } from "../sync/naming";

/**
 * Body ceiling for a command call. Fastify's default is 1 MiB, which a whole-board
 * snapshot crosses in the low hundreds of cards once descriptions, checklists and
 * links are counted (~2 KB per populated card) — and the failure reaches the
 * caller as an opaque error. 8 MiB is roughly 4,000 such cards.
 *
 * Set **per route**, not on the instance: `apps/server/src/app.ts` builds one
 * Fastify instance for every route, so raising it there would raise the ceiling
 * for auth, tickets and unfurl too.
 */
export const COMMAND_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

export interface CommandRoutesOptions {
  db: Database;
  keys: TokenKeys;
  hocuspocus: Hocuspocus;
}

/**
 * The agent write path (R13): the same command catalog the UI uses, exposed over
 * authenticated HTTP and executed **server-side against the live board doc** via
 * a Hocuspocus direct connection — so a REST/agent edit persists to Postgres and
 * broadcasts to connected clients exactly like a UI edit (server/UI parity).
 *
 * There is no `boardId` in the request: every command runs against the caller's
 * single content doc `board:<userId>`, resolved from the authenticated user id.
 * The doc is opened with the same mechanism the UI sync path uses — a short-lived
 * `openDirectConnection`, whose `disconnect()` flushes to Postgres.
 */
export async function commandRoutes(
  app: FastifyInstance,
  opts: CommandRoutesOptions,
): Promise<void> {
  const { keys, hocuspocus } = opts;

  // Self-documenting catalog: name, description, JSON Schema derived from zod.
  app.get("/api/commands", async () => ({
    commands: commands.map((command) => ({
      name: command.name,
      description: command.description,
      // Input mode: zod's default (output) mode lists every *defaulted* field as
      // `required`, which would tell a caller it must supply values the writer
      // generates for it — inverting the authorable-snapshot promise (R23).
      inputSchema: z.toJSONSchema(command.input, { io: "input" }),
    })),
  }));

  // Fastify raises FST_ERR_CTP_BODY_TOO_LARGE during body parsing, before the
  // handler runs, so a real 413 has to be shaped here. Encapsulated: this
  // handler is scoped to the routes registered in this plugin.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply
        .status(413)
        .send({ error: `request body too large (limit ${COMMAND_BODY_LIMIT_BYTES} bytes)` });
    }
    request.log.error({ err: error }, "command route error");
    const status = error.statusCode ?? 500;
    // A 5xx message can carry internal detail; a 4xx one is about the request.
    return reply.status(status).send({ error: status >= 500 ? "internal error" : error.message });
  });

  app.post(
    "/api/commands/:name",
    { bodyLimit: COMMAND_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const userId = await authenticateBearer(request, keys);
      if (!userId) return reply.status(401).send({ error: "unauthorized" });

      const command = getCommand((request.params as { name: string }).name);
      if (!command) return reply.status(404).send({ error: "unknown command" });

      const parsed = command.input.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "invalid input", issues: parsed.error.issues });
      }

      // Resolve the caller's own content doc `board:<userId>`. No ownership lookup
      // and no request-supplied id: a user can only ever reach the doc keyed by
      // their authenticated identity.
      const boardConn = await hocuspocus.openDirectConnection(boardDocName(userId), { userId });

      const disconnect = async (): Promise<void> => {
        // disconnect() flushes the document to Postgres (and broadcasts to any
        // connected clients), so persistence is guaranteed before we respond.
        await boardConn.disconnect();
      };

      let result: unknown;
      try {
        const ctx: CommandContext = {
          getBoardDoc: () => boardConn.document!,
          clientId: String(boardConn.document?.clientID ?? "server"),
          now: () => Date.now(),
          userId,
        };
        result = execute(command, ctx, parsed.data);
      } catch (error) {
        request.log.error({ err: error }, "command execution failed");
        await disconnect();
        // An import that refuses carries its own reason, and the guarantee that
        // nothing was written. A destructive call failing with a bare "command
        // failed" invites a retry (R21). Every other error stays opaque: its
        // message can carry internal detail.
        const reason = error instanceof ImportError ? error.message : "command failed";
        return reply.status(422).send({ error: reason });
      }

      await disconnect();
      return reply.send({ result });
    },
  );
}
