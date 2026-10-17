import { randomUUID } from "node:crypto";
import { hostedCheckoutRoutes } from "./hosted/routes.js";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { AroContext } from "./context.js";
import type { Sql } from "./db/client.js";
import type { Env } from "./env.js";
import { randomToken } from "./lib/crypto.js";
import { AroError } from "./lib/errors.js";
import { type ProviderRegistry, defaultRegistry } from "./providers/registry.js";
import { type DbProbe, healthRoutes } from "./routes/health.js";
import { v1Routes } from "./routes/v1.js";
import { type SecretResolver, envSecretResolver } from "./security/secrets.js";

/**
 * Header paths that must never reach logs: every credential defined in the
 * OpenAPI security schemes plus provider signatures.
 */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-aro-public-key"]',
  'req.headers["x-aro-checkout-secret"]',
  'req.headers["x-api-key"]',
  'req.headers["x-webhook-signature"]',
  'req.headers["stripe-signature"]',
];

export type AppDeps = {
  env: Env;
  sql?: Sql;
  providers?: ProviderRegistry;
  secrets?: SecretResolver;
  fetch?: typeof fetch;
  dbProbe?: DbProbe;
  logger?: FastifyServerOptions["logger"];
};

export function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: deps.logger ?? {
      level: deps.env.LOG_LEVEL,
      redact: { paths: LOG_REDACT_PATHS, censor: "[REDACTED]" },
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID();
    },
    requestIdHeader: false,
    bodyLimit: 256 * 1024,
    // Hosted Checkout AES-GCM opaque link token (>100 chars). Route validates max 2048.
    maxParamLength: 2048,
    trustProxy: true,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AroError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message, request_id: req.id });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({
        error: status === 429 ? "RATE_LIMITED" : "INVALID_REQUEST",
        message: e.message ?? "Invalid request",
        request_id: req.id,
      });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Internal error", request_id: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: "NOT_FOUND", message: "Route not found", request_id: req.id });
  });

  const sql = deps.sql;
  app.register(healthRoutes, {
    version: deps.env.ARO_VERSION,
    ...(deps.dbProbe
      ? { dbProbe: deps.dbProbe }
      : sql
        ? { dbProbe: async () => (await sql`SELECT 1 AS ok`).length === 1 }
        : {}),
  });

  let ctx: AroContext | undefined;
  if (sql) {
    if (deps.env.NODE_ENV !== "production" && (!deps.env.ARO_CHECKOUT_SECRET_KEY || !deps.env.ARO_OPERATOR_JWT_SECRET)) {
      app.log.warn("using ephemeral checkout/operator keys (non-production only)");
    }
    ctx = {
      sql,
      env: deps.env,
      providers: deps.providers ?? defaultRegistry(),
      secrets: deps.secrets ?? envSecretResolver(),
      log: app.log,
      keys: {
        checkoutSecret: deps.env.ARO_CHECKOUT_SECRET_KEY ?? randomToken(32),
        operatorJwt: deps.env.ARO_OPERATOR_JWT_SECRET ?? randomToken(32),
      },
      fetch: deps.fetch ?? fetch,
    };
    app.register(rateLimit, {
      global: false,
      errorResponseBuilder: (req, c) => ({
        statusCode: 429,
        error: "RATE_LIMITED",
        message: `Rate limit exceeded, retry in ${c.after}`,
        request_id: req.id,
      }),
    });
    app.register(v1Routes, { ctx });
    if (deps.env.ARO_HOSTED_CHECKOUT_ENABLED) app.register(hostedCheckoutRoutes, { ctx });
  }

  return Object.assign(app, { aro: ctx });
}
