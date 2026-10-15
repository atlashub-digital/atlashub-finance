import { randomUUID } from "node:crypto";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { Env } from "./env.js";
import { AroError } from "./lib/errors.js";
import { healthRoutes, type DbProbe } from "./routes/health.js";

/**
 * Header/body paths that must never reach logs: credentials of every kind
 * defined in the OpenAPI security schemes plus provider signatures.
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
      return typeof incoming === "string" && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    },
    requestIdHeader: false,
    bodyLimit: 256 * 1024,
    trustProxy: true,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AroError) {
      return reply
        .status(err.statusCode)
        .send({ error: err.code, message: err.message, request_id: req.id });
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
    return reply
      .status(500)
      .send({ error: "INTERNAL_ERROR", message: "Internal error", request_id: req.id });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: "NOT_FOUND", message: "Route not found", request_id: req.id });
  });

  app.register(healthRoutes, { version: deps.env.ARO_VERSION, dbProbe: deps.dbProbe });

  return app;
}
