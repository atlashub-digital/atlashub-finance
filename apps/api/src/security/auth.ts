import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AroContext } from "../context.js";
import { hmacSha256Hex, safeEqualHex } from "../lib/crypto.js";
import { errors } from "../lib/errors.js";
import { type Project, findProjectByApiKey } from "../modules/projects/repo.js";

const headerValue = (req: FastifyRequest, name: string) => {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

export function bearer(req: FastifyRequest): string | undefined {
  const h = headerValue(req, "authorization");
  const m = h ? /^Bearer\s+(.+)$/i.exec(h.trim()) : null;
  return m?.[1];
}

/** X-ARO-Public-Key → project (browser-safe checkout scope only). */
export async function requirePublicKey(ctx: AroContext, req: FastifyRequest): Promise<Project> {
  const key = headerValue(req, "x-aro-public-key");
  const project = key ? await findProjectByApiKey(ctx.sql, "public", key) : undefined;
  if (!project) throw errors.unauthorized();
  return project;
}

/** Authorization: Bearer <server key> → project. */
export async function requireServerKey(ctx: AroContext, req: FastifyRequest): Promise<Project> {
  const key = bearer(req);
  const project = key ? await findProjectByApiKey(ctx.sql, "server", key) : undefined;
  if (!project) throw errors.unauthorized();
  return project;
}

/**
 * Checkout secrets are derived, not stored: HMAC(key, session id). This lets
 * an idempotent replay of create return the same secret without persisting it.
 */
export const checkoutSecretFor = (key: string, sessionId: string) =>
  `aro_cs_${createHmac("sha256", key).update(`checkout:${sessionId}`).digest("base64url")}`;

export function verifyCheckoutSecret(key: string, sessionId: string, provided: string | undefined) {
  if (!provided) return false;
  const expected = checkoutSecretFor(key, sessionId);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OperatorClaims = {
  sub: string;
  tenant?: string;
  projects: string[];
  scopes: string[];
  exp: number;
};

/** Minimal HS256 JWT verification for operator tokens (docs/36 §Authentication). */
export function verifyOperatorToken(secret: string, token: string | undefined, now = Date.now()): OperatorClaims {
  if (!token) throw errors.unauthorized();
  const parts = token.split(".");
  if (parts.length !== 3) throw errors.unauthorized();
  const [h, p, s] = parts as [string, string, string];
  let header: { alg?: string; typ?: string };
  let claims: Partial<OperatorClaims> & { nbf?: number };
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    throw errors.unauthorized();
  }
  if (header.alg !== "HS256") throw errors.unauthorized();
  const expected = Buffer.from(createHmac("sha256", secret).update(`${h}.${p}`).digest()).toString("hex");
  const given = Buffer.from(s, "base64url").toString("hex");
  if (!safeEqualHex(expected, given)) throw errors.unauthorized();
  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowS) throw errors.unauthorized();
  if (typeof claims.nbf === "number" && claims.nbf > nowS) throw errors.unauthorized();
  if (typeof claims.sub !== "string" || !Array.isArray(claims.scopes) || !Array.isArray(claims.projects)) {
    throw errors.unauthorized();
  }
  return claims as OperatorClaims;
}

export function requireOperatorScope(claims: OperatorClaims, project: string, scope: string) {
  if (!claims.scopes.includes(scope)) throw errors.forbidden("Missing scope");
  if (!claims.projects.includes(project) && !claims.projects.includes("*")) throw errors.forbidden("Project not in scope");
}

/** Keyed request fingerprint for idempotency (keyed so payer documents are not brute-forceable). */
export const requestFingerprint = (key: string, canonical: string) => hmacSha256Hex(key, `request:${canonical}`);
