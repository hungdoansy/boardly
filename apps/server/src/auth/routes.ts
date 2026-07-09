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

/** Extract the refresh token from the cookie, a Bearer header, or the body. */
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
        return reply.send({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          userId: session.userId,
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
      return reply.send({ accessToken: session.accessToken, refreshToken: session.refreshToken });
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
