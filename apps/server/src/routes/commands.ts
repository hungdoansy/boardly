import { commands, execute, getCommand, type CommandContext } from "@boardly/commands";
import type { Hocuspocus } from "@hocuspocus/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticateBearer } from "../auth/bearer";
import type { TokenKeys } from "../auth/tokens";
import type { Database } from "../db/client";
import { boardDocName, workspaceDocName } from "../sync/naming";

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

    // Resolve the target doc from the input: board-scoped (has boardId) is
    // authorized by identity — the content doc is keyed by the user id, so the
    // boardId must be the caller's own (no ownership-table lookup).
    const boardId =
      typeof (parsed.data as { boardId?: unknown }).boardId === "string"
        ? (parsed.data as { boardId: string }).boardId
        : undefined;

    if (boardId && boardId !== userId) {
      return reply.status(403).send({ error: "forbidden" });
    }

    const wsConn = await hocuspocus.openDirectConnection(workspaceDocName(userId), { userId });
    const boardConn = boardId
      ? await hocuspocus.openDirectConnection(boardDocName(boardId), { userId })
      : null;

    const disconnectAll = async (): Promise<void> => {
      // disconnect() flushes the document to Postgres (and broadcasts to any
      // connected clients), so persistence is guaranteed before we respond.
      await boardConn?.disconnect();
      await wsConn.disconnect();
    };

    let result: unknown;
    try {
      const ctx: CommandContext = {
        getWorkspaceDoc: () => wsConn.document!,
        getBoardDoc: (id) => {
          if (id === boardId && boardConn?.document) return boardConn.document;
          throw new Error(`board ${id} is not available on this request`);
        },
        clientId: String((boardConn ?? wsConn).document?.clientID ?? "server"),
        now: () => Date.now(),
        userId,
      };
      result = execute(command, ctx, parsed.data);
    } catch (error) {
      request.log.error({ err: error }, "command execution failed");
      await disconnectAll();
      return reply.status(422).send({ error: "command failed" });
    }

    await disconnectAll();
    return reply.send({ result });
  });
}
