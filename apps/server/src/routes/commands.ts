import { commands, execute, getCommand, type CommandContext } from "@boardly/commands";
import type { Hocuspocus } from "@hocuspocus/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { boardDocName } from "../sync/naming";

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
      inputSchema: z.toJSONSchema(command.input),
    })),
  }));

  app.post("/api/commands/:name", async (request, reply) => {
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
      return reply.status(422).send({ error: "command failed" });
    }

    await disconnect();
    return reply.send({ result });
  });
}
