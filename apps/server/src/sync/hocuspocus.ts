import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

import { Server as HocuspocusServer } from "@hocuspocus/server";

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
 * A Hocuspocus `Server` that authorizes every connection (one-time ticket +
 * board ownership + origin) before any sync, and persists document state to
 * Postgres. It is NOT `listen()`-ed on its own port — {@link attachSyncServer}
 * feeds it the Fastify HTTP server's upgrades via Hocuspocus's own crossws
 * adapter (v4 speaks crossws, so we reuse its connection wiring verbatim).
 */
export function createSyncServer({
  db,
  ticketStore,
  config,
}: CreateSyncServerDeps): HocuspocusServer {
  const allowedOrigins = new Set(
    config.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );

  return new HocuspocusServer({
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

interface CrosswsLike {
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
}

/**
 * Route WebSocket upgrades on {@link SYNC_PATH} to Hocuspocus (other paths are
 * rejected). Returns a disposer that flushes pending stores + closes sockets.
 */
export function attachSyncServer(
  httpServer: HttpServer,
  server: HocuspocusServer,
): () => Promise<void> {
  // `crossws` is Hocuspocus's connection adapter (created in the Server ctor).
  // Not part of the public types, but reusing it is exactly what Server.listen
  // does — it gives correct peer/message/close semantics for free.
  const crossws = (server as unknown as { crossws: CrosswsLike }).crossws;

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
    crossws.handleUpgrade(request, socket, head);
  };

  httpServer.on("upgrade", onUpgrade);

  return async () => {
    httpServer.off("upgrade", onUpgrade);
    // Persist any debounced writes before dropping connections.
    server.hocuspocus.flushPendingStores();
    server.hocuspocus.closeConnections();
  };
}
