import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AroContext } from "../context.js";
import type { Db } from "../db/client.js";
import { audit } from "../audit/audit.js";
import { AroError, errors } from "../lib/errors.js";
import { orderStatusFromDb } from "../modules/payments/transitions.js";
import type { Project } from "../modules/projects/repo.js";
import { bearer, requireServerKey, verifyCheckoutSecret } from "../security/auth.js";
import { readClaimProof, signClaimProof, type ClaimBinding } from "./claim-token.js";

const Exchange = z.object({
  project: z.string().min(1).max(128), orderId: z.uuid(), checkoutSessionId: z.uuid(),
  offerId: z.uuid(), proof: z.string().min(1).max(4096),
  principalId: z.string().min(1).max(128).refine(value => value.trim().length > 0),
}).strict();
const conflict = () => new AroError(409, "ENTITLEMENT_NOT_READY", "Claim unavailable or already consumed");

/** Same order→session lock order as payment reversals; no financial writes. */
async function binding(tx: Db, sessionId: string, project?: Project): Promise<ClaimBinding & { projectId: string }> {
  const [o] = await tx<{ id: string; status: string; tenantId: string; projectId: string; contactId: string }[]>`
    SELECT o.id, o.status, o."tenantId", o."projectId", o."contactId"
    FROM commerce_order o JOIN aro_checkout_session s ON s."orderId" = o.id
    WHERE s.id = ${sessionId} FOR UPDATE OF o`;
  if (!o || (project && (o.projectId !== project.projectId || o.tenantId !== project.tenantId))) throw errors.forbidden();
  const [s] = await tx<{ offerId: string; slug: string; state: string; hostedClaimEligible: boolean }[]>`
    SELECT s."offerId", p.slug, s.state, s."hostedClaimEligible" FROM aro_checkout_session s
    JOIN aro_project_config p ON p."projectId" = s."projectId" AND p."tenantId" = s."tenantId"
    JOIN aro_offer f ON f.id = s."offerId" AND f."projectId" = s."projectId" AND f."tenantId" = s."tenantId"
    WHERE s.id = ${sessionId} AND s."projectId" = ${o.projectId} AND s."tenantId" = ${o.tenantId}
      AND s."contactId" = ${o.contactId} FOR UPDATE OF s`;
  if (!s || !s.hostedClaimEligible) throw errors.forbidden();
  if (s.state !== "APPROVED" || orderStatusFromDb(o.status) !== "APPROVED" || !o.contactId) throw conflict();
  const items = await tx<{ entitlementKeys: string[] }[]>`
    SELECT "entitlementKeys" FROM aro_order_item WHERE "orderId" = ${o.id}
      AND "tenantId" = ${o.tenantId} AND "offerId" = ${s.offerId}`;
  const keys = [...new Set(items.flatMap(i => i.entitlementKeys))];
  const entitlements = await tx<{ key: string }[]>`
    SELECT key FROM commerce_entitlement WHERE "projectId" = ${o.projectId} AND "tenantId" = ${o.tenantId}
      AND "contactId" = ${o.contactId} AND source = 'order' AND "sourceId" = ${o.id}
      AND status = 'active' AND "revokedAt" IS NULL
      AND "validFrom" <= (clock_timestamp() AT TIME ZONE 'UTC')
      AND ("validUntil" IS NULL OR "validUntil" > (clock_timestamp() AT TIME ZONE 'UTC')) FOR SHARE`;
  if (!keys.length || !keys.every(key => entitlements.some(e => e.key === key))) throw conflict();
  const consumed = await tx`SELECT 1 FROM aro_checkout_claim WHERE "checkoutSessionId" = ${sessionId}`;
  if (consumed.length) throw conflict();
  return { project: s.slug, projectId: o.projectId, tenantId: o.tenantId,
    orderId: o.id, checkoutSessionId: sessionId, offerId: s.offerId, aroCustomerId: o.contactId };
}

export async function hostedClaimRoutes(app: FastifyInstance, { ctx }: { ctx: AroContext }) {
  const key = ctx.env.ARO_CLAIM_SERVER_KEY!;
  const base = new URL(ctx.env.ARO_PUBLIC_BASE_URL);
  if (base.protocol !== "https:" && !(ctx.env.NODE_ENV === "test" && base.protocol === "http:" && base.hostname === "127.0.0.1")) {
    throw new Error("Hosted claims require an HTTPS ARO_PUBLIC_BASE_URL");
  }
  app.addHook("onRequest", async (req, reply) => {
    reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
    if (req.protocol !== "https" && !(ctx.env.NODE_ENV === "test" && req.protocol === "http" && req.hostname === "127.0.0.1" && req.ip === "127.0.0.1")) throw errors.forbidden("HTTPS required");
  });
  const config = { rateLimit: { max: 30, timeWindow: "1 minute" } };
  app.post<{ Params: { id: string } }>("/v1/checkout-sessions/:id/claim-proof", { config }, async (req, reply) => {
    if (!z.uuid().safeParse(req.params.id).success || !z.object({}).strict().safeParse(req.body).success) throw errors.invalidRequest();
    const secret = req.headers["x-aro-checkout-secret"];
    if (typeof secret !== "string" || !verifyCheckoutSecret(ctx.keys.checkoutSecret, req.params.id, secret)) throw errors.forbidden();
    const proof = await ctx.sql.begin(async tx => {
      const b = await binding(tx, req.params.id);
      const { projectId: _projectId, ...scoped } = b;
      const result = signClaimProof(scoped, key);
      await audit(tx, { tenantId: b.tenantId, actor: "aro:hosted", action: "aro.claim.proof_issued", objectId: req.params.id });
      return { project: b.project, orderId: b.orderId, checkoutSessionId: b.checkoutSessionId, offerId: b.offerId, ...result };
    });
    return reply.send(proof);
  });
  app.post("/v1/checkout-claims", { config }, async (req: FastifyRequest, reply) => {
    const provided = bearer(req);
    if (!provided || Buffer.byteLength(provided) !== Buffer.byteLength(key) || !timingSafeEqual(Buffer.from(provided), Buffer.from(key))) throw errors.unauthorized();
    const project = await requireServerKey(ctx, req);
    const parsed = Exchange.safeParse(req.body);
    if (!parsed.success) throw errors.invalidRequest();
    const input = parsed.data;
    if (input.project !== project.slug) throw errors.forbidden();
    const result = await ctx.sql.begin(async tx => {
      const b = await binding(tx, input.checkoutSessionId, project);
      // Verify AFTER acquiring locks so a request waiting on a reversal cannot outlive its proof.
      const proof = readClaimProof(input.proof, key);
      if (!proof || !Object.entries(b).filter(([k]) => k !== "projectId").every(([k, v]) => proof[k as keyof typeof proof] === v)
        || b.orderId !== input.orderId || b.offerId !== input.offerId) throw errors.forbidden();
      const issuedAt = Date.now();
      const expiresAt = Math.min(proof.expiresAt, issuedAt + 120_000);
      const inserted = await tx`
        INSERT INTO aro_checkout_claim ("checkoutSessionId", "tenantId", "projectId", "orderId", "offerId", "contactId", "principalId", "issuedAt", "expiresAt")
        VALUES (${b.checkoutSessionId}, ${b.tenantId}, ${b.projectId}, ${b.orderId}, ${b.offerId}, ${b.aroCustomerId}, ${input.principalId}, ${new Date(issuedAt)}, ${new Date(expiresAt)})
        ON CONFLICT DO NOTHING RETURNING "checkoutSessionId"`;
      if (!inserted.length) throw conflict();
      await audit(tx, { tenantId: b.tenantId, actor: `project:${project.slug}`, action: "aro.claim.consumed", objectId: b.checkoutSessionId });
      return { project: b.project, orderId: b.orderId, checkoutSessionId: b.checkoutSessionId, offerId: b.offerId,
        aroCustomerId: b.aroCustomerId, principalId: input.principalId,
        orderStatus: "APPROVED", entitlementStatus: "ACTIVE", issuedAt, expiresAt };
    });
    return reply.send(result);
  });
}
