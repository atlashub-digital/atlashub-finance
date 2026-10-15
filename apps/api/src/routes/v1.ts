import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AroContext } from "../context.js";
import { AroError, errors } from "../lib/errors.js";
import { parseOr400 } from "../lib/validate.js";
import { CreateCheckoutSessionRequest, IdempotencyKey } from "../modules/checkout/schema.js";
import { CheckoutService } from "../modules/checkout/service.js";
import { resolveEntitlements } from "../modules/entitlements/service.js";
import { revenueOverview } from "../modules/operator/revenue.js";
import { getOrder } from "../modules/orders/service.js";
import { ingestProviderWebhook } from "../modules/payments/webhooks.js";
import { findProjectBySlug, isOriginAllowedAnywhere } from "../modules/projects/repo.js";
import type { ProviderKey } from "../providers/types.js";
import {
  bearer,
  requireOperatorScope,
  requirePublicKey,
  requireServerKey,
  verifyCheckoutSecret,
  verifyOperatorToken,
} from "../security/auth.js";

const CORS_HEADERS = "content-type, idempotency-key, x-aro-public-key, x-aro-checkout-secret, x-request-id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const originOf = (req: FastifyRequest) => (typeof req.headers.origin === "string" ? req.headers.origin : undefined);

/** Browser calls must come from an allowlisted origin; server-to-server calls carry no Origin. */
function enforceOrigin(req: FastifyRequest, reply: FastifyReply, allowed: string[]) {
  const origin = originOf(req);
  if (!origin) return;
  if (!allowed.includes(origin)) throw errors.forbidden("Origin not allowed");
  reply.header("access-control-allow-origin", origin).header("vary", "Origin");
}

export async function v1Routes(app: FastifyInstance, opts: { ctx: AroContext }) {
  const { ctx } = opts;
  const checkout = new CheckoutService(ctx);

  // CORS preflight for the browser-facing checkout endpoints.
  const preflight = async (req: FastifyRequest, reply: FastifyReply) => {
    const origin = originOf(req);
    if (origin && (await isOriginAllowedAnywhere(ctx.sql, origin))) {
      reply
        .header("access-control-allow-origin", origin)
        .header("vary", "Origin")
        .header("access-control-allow-methods", "GET, POST")
        .header("access-control-allow-headers", CORS_HEADERS)
        .header("access-control-max-age", "600");
    }
    return reply.status(204).send();
  };
  app.options("/v1/checkout-sessions", preflight);
  app.options("/v1/checkout-sessions/:checkout_session_id", preflight);

  app.post(
    "/v1/checkout-sessions",
    {
      config: {
        rateLimit: {
          max: ctx.env.ARO_CHECKOUT_RATE_LIMIT_PER_MIN,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => `${String(req.headers["x-aro-public-key"] ?? "")}|${req.ip}`,
        },
      },
    },
    async (req, reply) => {
      const project = await requirePublicKey(ctx, req);
      enforceOrigin(req, reply, project.allowedOrigins);
      const key = parseOr400(IdempotencyKey, req.headers["idempotency-key"]);
      const body = parseOr400(CreateCheckoutSessionRequest, req.body);
      const { replayed, view } = await checkout.create(project, body, key);
      reply.header("cache-control", "no-store");
      if (replayed) reply.header("idempotent-replayed", "true");
      return reply.status(201).send(view);
    },
  );

  app.get<{ Params: { checkout_session_id: string } }>("/v1/checkout-sessions/:checkout_session_id", async (req, reply) => {
    const id = req.params.checkout_session_id;
    const secret = req.headers["x-aro-checkout-secret"];
    if (!UUID.test(id) || typeof secret !== "string" || !verifyCheckoutSecret(ctx.keys.checkoutSecret, id, secret)) {
      throw errors.unauthorized();
    }
    const project = await checkout.projectOfSession(id);
    if (!project) throw errors.notFound("Checkout session not found");
    enforceOrigin(req, reply, project.allowedOrigins);
    reply.header("cache-control", "no-store");
    return checkout.view(await checkout.loadSession(id));
  });

  app.get<{ Params: { order_id: string } }>("/v1/orders/:order_id", async (req) => {
    const project = await requireServerKey(ctx, req);
    const order = await getOrder(ctx.sql, project.projectId, req.params.order_id);
    if (!order) throw errors.notFound("Order not found");
    return order;
  });

  const ResolveRequest = z.union([
    z.object({ project: z.string(), customer_id: z.uuid(), identity: z.object({ email: z.email().optional() }).optional() }),
    z.object({ project: z.string(), identity: z.object({ email: z.email() }) }),
  ]);
  app.post("/v1/entitlements/resolve", async (req) => {
    const project = await requireServerKey(ctx, req);
    const body = parseOr400(ResolveRequest, req.body);
    if (body.project !== project.slug) throw errors.forbidden("Key is not valid for this project");
    let contactId: string | undefined;
    if ("customer_id" in body) {
      const [c] = await ctx.sql<{ id: string }[]>`
        SELECT id FROM crm_contact WHERE id = ${body.customer_id} AND "tenantId" = ${project.tenantId}`;
      contactId = c?.id;
    } else {
      const [c] = await ctx.sql<{ id: string }[]>`
        SELECT id FROM crm_contact
        WHERE "tenantId" = ${project.tenantId} AND "emailNorm" = ${body.identity.email.trim().toLowerCase()}`;
      contactId = c?.id;
    }
    if (!contactId) return { project: project.slug, entitlements: [] };
    return {
      project: project.slug,
      customer_id: contactId,
      entitlements: await resolveEntitlements(ctx.sql, project, contactId),
    };
  });

  // Provider ingress needs the exact raw body for signature verification.
  await app.register(async (hooks) => {
    hooks.removeAllContentTypeParsers();
    hooks.addContentTypeParser("*", { parseAs: "string", bodyLimit: 256 * 1024 }, (_req, body, done) => done(null, body));
    for (const provider of ["pixgo", "misticpay", "stripe"] as ProviderKey[]) {
      hooks.post(`/v1/webhooks/providers/${provider}`, async (req) => {
        const rawBody = typeof req.body === "string" ? req.body : "";
        const outcome = await ingestProviderWebhook(ctx, provider, { headers: req.headers, rawBody });
        req.log.info({ provider, outcome: outcome.status }, "provider webhook");
        return { received: true, status: outcome.status };
      });
    }
  });

  const OverviewQuery = z.object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    reporting_currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  });
  app.get<{ Params: { project: string } }>("/v1/operator/projects/:project/revenue/overview", async (req) => {
    const claims = verifyOperatorToken(ctx.keys.operatorJwt, bearer(req));
    const slug = req.params.project;
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) throw new AroError(400, "INVALID_REQUEST", "Invalid project");
    requireOperatorScope(claims, slug, "revenue:read");
    const q = parseOr400(OverviewQuery, req.query);
    const project = await findProjectBySlug(ctx.sql, slug);
    if (!project) throw errors.notFound("Project not found");
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400_000);
    if (from >= to) throw new AroError(400, "INVALID_REQUEST", "from must be before to");
    return revenueOverview(ctx.sql, {
      projectId: project.projectId,
      slug,
      from,
      to,
      currency: q.reporting_currency ?? project.defaultCurrency,
    });
  });
}
