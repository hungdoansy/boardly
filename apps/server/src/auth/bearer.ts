import type { FastifyRequest } from "fastify";

import { type TokenKeys, verifyAccessToken } from "./tokens";

/**
 * Resolve the authenticated user id from a `Authorization: Bearer <access token>`
 * header, or `null` if absent/invalid. Shared by the ticket + board + command
 * routes so Bearer handling stays in one place.
 */
export async function authenticateBearer(
  request: FastifyRequest,
  keys: TokenKeys,
): Promise<string | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { sub } = await verifyAccessToken(keys, header.slice("Bearer ".length));
    return sub;
  } catch {
    return null;
  }
}
