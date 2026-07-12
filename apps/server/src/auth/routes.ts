import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ServerConfig } from "../config";
import { AuthError, type AuthService, type Session } from "./service";

const REFRESH_COOKIE = "boardly_refresh";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export interface AuthRoutesOptions {
  service: AuthService;
  config: ServerConfig;
}

/**
 * The desktop app (Tauri webview) can't use the httpOnly refresh cookie: its
 * origin (`tauri://localhost`) is cross-site to the API over an insecure
 * localhost scheme, so a `Secure`/`SameSite=Lax` cookie is never stored or
 * sent back. For those clients we ALSO return the refresh token in the response
 * body; the desktop keychain stashes it and presents it on `/auth/refresh`.
 *
 * Gating on the Tauri origin keeps the web deploy's httpOnly protection intact:
 * a browser sets `Origin` itself and page JS cannot forge it, so web XSS can't
 * make the server hand back the refresh token in a readable body.
 */
const DESKTOP_ORIGINS = new Set(["tauri://localhost", "https://tauri.localhost"]);

function isDesktopClient(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  return typeof origin === "string" && DESKTOP_ORIGINS.has(origin);
}

/**
 * Extract the refresh token to *present* (cookie, Bearer header, or body). This
 * only reads a token the caller already holds; it never gates issuance.
 */
function readRefreshToken(request: FastifyRequest): string | null {
  const cookieToken = request.cookies?.[REFRESH_COOKIE];
  if (cookieToken) return cookieToken;
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim() || null;
  const body = request.body as { refreshToken?: unknown } | undefined;
  return typeof body?.refreshToken === "string" ? body.refreshToken : null;
}

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions): Promise<void> {
  const { service, config } = opts;

  await app.register(cookie);
  // Registered but not global: only the login route opts in (below).
  await app.register(rateLimit, { global: false });

  const setRefreshCookie = (reply: FastifyReply, session: Session): void => {
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/auth",
      expires: session.refreshExpiresAt,
    });
  };

  const clearRefreshCookie = (reply: FastifyReply): void => {
    reply.clearCookie(REFRESH_COOKIE, { path: "/auth" });
  };

  app.post("/auth/signup", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "invalid request" });
    await service.signup(parsed.data.email, parsed.data.password);
    // Uniform response — never reveals whether the email already existed.
    return reply.status(201).send({ ok: true });
  });

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: { max: config.LOGIN_RATE_MAX, timeWindow: config.LOGIN_RATE_WINDOW_MS },
      },
    },
    async (request, reply) => {
      const parsed = credentialsSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "invalid request" });
      try {
        const session = await service.login(parsed.data.email, parsed.data.password);
        setRefreshCookie(reply, session);
        // Web gets the refresh token via the httpOnly cookie only; the desktop
        // webview (which the cookie can't reach) also gets it in the body to
        // stash in the OS keychain. Gated on the Tauri origin (see above).
        return reply.send({
          accessToken: session.accessToken,
          userId: session.userId,
          ...(isDesktopClient(request) ? { refreshToken: session.refreshToken } : {}),
        });
      } catch (error) {
        if (error instanceof AuthError) return reply.status(401).send({ error: error.message });
        throw error;
      }
    },
  );

  app.post("/auth/refresh", async (request, reply) => {
    const token = readRefreshToken(request);
    if (!token) return reply.status(401).send({ error: "invalid or expired token" });
    try {
      const session = await service.refresh(token);
      setRefreshCookie(reply, session);
      // Return the ROTATED refresh token to desktop so the keychain stays
      // current — the old one is now revoked, and reusing it would trip the
      // family-reuse guard and force a logout.
      return reply.send({
        accessToken: session.accessToken,
        ...(isDesktopClient(request) ? { refreshToken: session.refreshToken } : {}),
      });
    } catch (error) {
      if (error instanceof AuthError) {
        clearRefreshCookie(reply);
        return reply.status(401).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = readRefreshToken(request);
    if (token) await service.logout(token);
    clearRefreshCookie(reply);
    return reply.send({ ok: true });
  });
}
