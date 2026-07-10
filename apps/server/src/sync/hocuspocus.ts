import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { Hocuspocus } from "@hocuspocus/server";
import { WebSocketServer } from "ws";

import type { ServerConfig } from "../config";
import type { Database } from "../db/client";
import { authenticateConnection } from "./authz";
import { createDatabaseExtension } from "./persistence";
import type { TicketStore } from "./ticket-store";

export interface SyncContext {
  userId: string;
}

export interface CreateSyncServerDeps {
  db: Database;
  ticketStore: TicketStore;
  config: ServerConfig;
}

/** The WebSocket path the sync server listens on. */
export const SYNC_PATH = "/sync";

/**
 * A Hocuspocus instance that authorizes every connection (one-time ticket +
 * board ownership + origin) before any sync, and persists document state to
 * Postgres. Not listening on its own port — {@link attachSyncServer} bolts it
 * onto the Fastify HTTP server.
 */
export function createSyncServer({ db, ticketStore, config }: CreateSyncServerDeps): Hocuspocus {
  const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );

  return new Hocuspocus({
    extensions: [createDatabaseExtension(db)],
    async onAuthenticate({ token, documentName, requestHeaders }): Promise<SyncContext> {
      const origin = requestHeaders.get("origin");
      // Throws SyncUnauthorizedError → Hocuspocus closes with 4403 (terminal;
      // HocuspocusProvider does not reconnect-storm on an auth failure).
      return authenticateConnection(
        { db, ticketStore, allowedOrigins },
        {
          token,
          documentName,
          origin,
        },
      );
    },
  });
}

/**
 * Route WebSocket upgrades on {@link SYNC_PATH} to Hocuspocus (other paths are
 * rejected). Returns a disposer that closes the ws layer.
 */
export function attachSyncServer(
  httpServer: HttpServer,
  hocuspocus: Hocuspocus,
): () => Promise<void> {
  const wss = new WebSocketServer({ noServer: true });

  const onUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== SYNC_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus reads `.url`/`.headers` off the request; IncomingMessage
      // satisfies that at runtime (its param type is the fetch `Request`).
      hocuspocus.handleConnection(ws, request as unknown as Request);
    });
  };

  httpServer.on("upgrade", onUpgrade);

  return async () => {
    httpServer.off("upgrade", onUpgrade);
    // Persist any debounced document writes before dropping connections.
    hocuspocus.flushPendingStores();
    hocuspocus.closeConnections();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  };
}
