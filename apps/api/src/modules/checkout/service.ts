import { randomUUID } from "node:crypto";
import { audit } from "../../audit/audit.js";
import type { AroContext } from "../../context.js";
import type { Db } from "../../db/client.js";
import { canonicalJson } from "../../lib/crypto.js";
import { parseBrDocument } from "../../lib/document.js";
import { AroError } from "../../lib/errors.js";
import {
  type AdapterContext,
  type PaymentInstruction,
  type ProviderKey,
  ProviderError,
  type ProviderPaymentSnapshot,
} from "../../providers/types.js";
import { checkoutSecretFor, requestFingerprint } from "../../security/auth.js";
import { enqueueEvent } from "../events/outbox.js";
import { type AttemptRow, applyProviderSnapshot } from "../payments/transitions.js";
import type { Project } from "../projects/repo.js";
import type { CreateCheckoutSessionRequest } from "./schema.js";

type OfferRow = {
  id: string;
  cadence: "once" | "month" | "year";
  paymentMethods: string[];
  slug: string;
  title: string;
  entitlementKeys: string[];
  productId: string;
  amountMinor: number;
  currency: string;
  market: string;
};

export type RouteCandidate = {
  routeId: string;
  providerAccountId: string;
  provider: ProviderKey;
  credentialRef: string;
  priority: number;
  ruleVersion: number;
};

type SessionRow = {
  id: string;
  tenantId: string;
  projectId: string;
  orderId: string;
  offerSlug: string;
  contactId: string | null;
  requestHash: string;
  state: string;
  market: string;
  method: "PIX" | "CARD";
  amountMinor: number;
  currency: string;
  paymentInstruction: PaymentInstruction | null;
  lastErrorCode: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

export type CheckoutSessionView = {
  id: string;
  order_id: string;
  project: string;
  offer: string;
  state: string;
  amount: { amount_minor: number; currency: string };
  checkout_secret: string;
  payment?: PaymentInstruction;
  expires_at?: string;
  created_at: string;
};

/** Longer than the provider HTTP timeout (15 s) plus local bookkeeping. */
const IN_FLIGHT_GRACE_MS = 60_000;

const PROVIDER_FAILURE_STATUS: Record<string, number> = { PROVIDER_UNAVAILABLE: 503, PROVIDER_REJECTED: 422 };

async function loadOffer(db: Db, projectId: string, slug: string) {
  const [row] = await db<OfferRow[]>`
    SELECT o.id, o.slug, o.title, o."entitlementKeys", o.cadence, o."paymentMethods",
           p."productId", p."amountMinor", p.currency, p.market
    FROM aro_offer o JOIN catalog_price p ON p.id = o."priceId"
    WHERE o."projectId" = ${projectId} AND o.slug = ${slug} AND o.status = 'active'
      AND p.status = 'active' AND p."amountMinor" IS NOT NULL`;
  return row;
}

/** PRIORITY_FAILOVER route lookup. Project-specific routes override tenant defaults. */
export async function routeCandidates(
  db: Db,
  project: Pick<Project, "tenantId" | "projectId">,
  q: { market: string; currency: string; method: "PIX" | "CARD" },
): Promise<RouteCandidate[]> {
  const rows = await db<(RouteCandidate & { projectScoped: boolean })[]>`
    SELECT r.id AS "routeId", r."providerAccountId", a.provider, a."credentialRef", r.priority, r."ruleVersion",
           (r."projectId" IS NOT NULL) AS "projectScoped"
    FROM aro_payment_route r JOIN aro_provider_account a ON a.id = r."providerAccountId"
    WHERE r."tenantId" = ${project.tenantId}
      AND (r."projectId" = ${project.projectId} OR r."projectId" IS NULL)
      AND r.active AND r."effectiveAt" <= now() AND a.status = 'active'
      AND r.currency = ${q.currency} AND r.method = ${q.method}
      AND (r.market = ${q.market} OR r.market = '*')
    ORDER BY r.priority, r.id`;
  const scoped = rows.some((r) => r.projectScoped) ? rows.filter((r) => r.projectScoped) : rows;
  const seen = new Set<string>();
  return scoped
    .filter((r) => !seen.has(r.providerAccountId) && seen.add(r.providerAccountId))
    .map(({ projectScoped: _p, ...r }) => r);
}

function fail(code: "INVALID_OFFER" | "INVALID_PAYER" | "NO_PAYMENT_ROUTE", message: string): never {
  throw new AroError(422, code, message);
}

export class CheckoutService {
  constructor(private readonly ctx: AroContext) {}

  private adapterCtx(c: { providerAccountId: string; provider: ProviderKey; credentialRef: string }): AdapterContext {
    return {
      account: { id: c.providerAccountId, provider: c.provider, credentialRef: c.credentialRef },
      secrets: this.ctx.secrets,
    };
  }

  async create(
    project: Project,
    input: CreateCheckoutSessionRequest,
    idempotencyKey: string,
  ): Promise<{ replayed: boolean; view: CheckoutSessionView }> {
    const { sql, keys } = this.ctx;
    if (input.project !== project.slug) throw new AroError(403, "FORBIDDEN", "Key is not valid for this project");
    const fingerprint = requestFingerprint(keys.checkoutSecret, canonicalJson(input));

    const [existing] = await sql<{ id: string; requestHash: string }[]>`
      SELECT id, "requestHash" FROM aro_checkout_session
      WHERE "projectId" = ${project.projectId} AND "idempotencyKey" = ${idempotencyKey}`;
    if (existing) {
      if (existing.requestHash !== fingerprint) {
        throw new AroError(409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key reused with a different request");
      }
      return { replayed: true, view: await this.advance(project, existing.id, input) };
    }

    const offer = await loadOffer(sql, project.projectId, input.offer);
    if (!offer) fail("INVALID_OFFER", "Unknown or inactive offer");
    const offers = [offer];
    for (const slug of new Set(input.bump_offers)) {
      if (slug === offer.slug) fail("INVALID_OFFER", "Bump offer duplicates the main offer");
      const bump = await loadOffer(sql, project.projectId, slug);
      if (!bump) fail("INVALID_OFFER", `Unknown or inactive bump offer: ${slug}`);
      offers.push(bump);
    }
    for (const o of offers) {
      if (o.currency !== input.currency) fail("INVALID_OFFER", `Offer ${o.slug} is not sold in ${input.currency}`);
      if (o.market !== "*" && o.market !== input.market) fail("INVALID_OFFER", `Offer ${o.slug} is not sold in market ${input.market}`);
      if (o.paymentMethods.length && !o.paymentMethods.includes(input.payment_method)) {
        fail("INVALID_OFFER", `Offer ${o.slug} is not sold with ${input.payment_method}`);
      }
      // Recurring billing (subscriptions) is not part of ARO V1.
      if (o.cadence !== "once") fail("INVALID_OFFER", `Offer ${o.slug} is recurring; recurring checkout is not available in V1`);
    }
    const amountMinor = offers.reduce((sum, o) => sum + o.amountMinor, 0);

    const doc = parseBrDocument(input.payer.document);
    if (input.payer.document && !doc) fail("INVALID_PAYER", "Invalid payer document");
    const routes = await routeCandidates(sql, project, { market: input.market, currency: input.currency, method: input.payment_method });
    if (!routes.length) fail("NO_PAYMENT_ROUTE", "No payment route for market/currency/method");
    const eligible = this.eligible(routes, amountMinor, input.currency, input.payment_method, doc?.kind);
    if (!eligible.length) {
      const docBlocked = routes.some((r) => this.ctx.providers[r.provider].capabilities.documentKinds.length > 0);
      if (docBlocked && !doc) fail("INVALID_PAYER", "Payer document (CPF/CNPJ) is required for this payment method");
      if (docBlocked && doc) fail("INVALID_PAYER", `Payer document type ${doc.kind} is not accepted for this route`);
      fail("NO_PAYMENT_ROUTE", "No provider accepts this amount/currency/method");
    }

    const sessionId = randomUUID();
    const orderId = randomUUID();
    const inserted = await sql.begin(async (tx) => {
      const email = input.payer.email.trim().toLowerCase();
      let [contact] = await tx<{ id: string }[]>`
        INSERT INTO crm_contact (id, "tenantId", "fullName", "emailNorm")
        VALUES (${randomUUID()}, ${project.tenantId}, ${input.payer.name}, ${email})
        ON CONFLICT ("tenantId", "emailNorm") WHERE "emailNorm" IS NOT NULL DO NOTHING
        RETURNING id`;
      if (!contact) {
        [contact] = await tx<{ id: string }[]>`
          SELECT id FROM crm_contact WHERE "tenantId" = ${project.tenantId} AND "emailNorm" = ${email}`;
      }
      const contactId = contact!.id;
      await tx`
        INSERT INTO commerce_order (id, "tenantId", status, currency, "totalMinor", "projectId", "contactId")
        VALUES (${orderId}, ${project.tenantId}, 'pending_payment', ${input.currency}, ${amountMinor},
                ${project.projectId}, ${contactId})`;
      for (const o of offers) {
        await tx`
          INSERT INTO aro_order_item (id, "tenantId", "orderId", "offerId", "productId", title, quantity,
                                      "unitAmountMinor", currency, "entitlementKeys")
          VALUES (${randomUUID()}, ${project.tenantId}, ${orderId}, ${o.id}, ${o.productId}, ${o.title}, 1,
                  ${o.amountMinor}, ${o.currency}, ${o.entitlementKeys})`;
      }
      const [s] = await tx`
        INSERT INTO aro_checkout_session (id, "tenantId", "projectId", "orderId", "offerId", "contactId",
          "idempotencyKey", "requestHash", market, country, method, "amountMinor", currency, "bumpOfferIds",
          attribution, metadata)
        VALUES (${sessionId}, ${project.tenantId}, ${project.projectId}, ${orderId}, ${offer.id}, ${contactId},
          ${idempotencyKey}, ${fingerprint}, ${input.market}, ${input.country ?? null}, ${input.payment_method},
          ${amountMinor}, ${input.currency}, ${offers.slice(1).map((o) => o.id)},
          ${tx.json(input.attribution ?? {})}, ${tx.json(input.metadata ?? {})})
        ON CONFLICT ("projectId", "idempotencyKey") DO NOTHING
        RETURNING id`;
      if (!s) return false; // concurrent request with the same key won the race
      await audit(tx, { tenantId: project.tenantId, actor: `project:${project.slug}`, action: "aro.checkout.created", objectId: sessionId });
      await enqueueEvent(tx, project, "checkout.started", `checkout.started:${sessionId}`, {
        checkout_session_id: sessionId,
        order_id: orderId,
        customer_id: contactId,
        offer: offer.slug,
        bump_offers: offers.slice(1).map((o) => o.slug),
        amount: { amount_minor: amountMinor, currency: input.currency },
        attribution: input.attribution ?? {},
      });
      return true;
    });
    if (!inserted) return this.create(project, input, idempotencyKey);
    return { replayed: false, view: await this.advance(project, sessionId, input) };
  }

  private eligible(routes: RouteCandidate[], amountMinor: number, currency: string, method: "PIX" | "CARD", docKind?: "CPF" | "CNPJ") {
    return routes.filter((r) => {
      const cap = this.ctx.providers[r.provider].capabilities;
      if (!cap.methods.includes(method) || !cap.currencies.includes(currency)) return false;
      if (cap.minAmountMinor !== undefined && amountMinor < cap.minAmountMinor) return false;
      if (cap.documentKinds.length && (!docKind || !cap.documentKinds.includes(docKind))) return false;
      return true;
    });
  }

  /**
   * Drives a CREATED session to PENDING by creating a provider payment, in
   * priority order with failover. Resumable: an idempotent replay continues
   * from where a previous call stopped (e.g. after an ambiguous create).
   */
  private async advance(project: Project, sessionId: string, input: CreateCheckoutSessionRequest) {
    const session = await this.loadSession(sessionId);
    if (session.state !== "CREATED" || session.paymentInstruction) {
      if (session.state === "FAILED" && session.lastErrorCode && !session.paymentInstruction) {
        throw new AroError(PROVIDER_FAILURE_STATUS[session.lastErrorCode] ?? 503, session.lastErrorCode as "PROVIDER_UNAVAILABLE", "Payment could not be created");
      }
      return this.view(session);
    }

    const doc = parseBrDocument(input.payer.document);
    const attempts = await this.ctx.sql<AttemptRow[]>`
      SELECT * FROM aro_payment_attempt WHERE "orderId" = ${session.orderId} ORDER BY "attemptNumber"`;
    const accounts = await this.ctx.sql<{ id: string; provider: ProviderKey; credentialRef: string }[]>`
      SELECT id, provider, "credentialRef" FROM aro_provider_account`;
    const accountOf = (id: string) => accounts.find((a) => a.id === id)!;

    // 1. Resolve an ambiguous previous attempt before trying anything else.
    //    A recent CREATED attempt belongs to a request still talking to the
    //    provider: never second-guess it (that could open a second live charge).
    const inFlight = attempts.some(
      (x) => x.state === "CREATED" && Date.now() - new Date(x.createdAt).getTime() < IN_FLIGHT_GRACE_MS,
    );
    if (inFlight) throw new AroError(409, "IDEMPOTENCY_CONFLICT", "Checkout creation already in progress; retry");
    for (const a of attempts.filter((x) => x.state === "UNKNOWN" || x.state === "CREATED")) {
      const acc = accountOf(a.providerAccountId);
      const outcome = await this.recover(a, { providerAccountId: acc.id, provider: acc.provider, credentialRef: acc.credentialRef });
      if (outcome === "done") return this.view(await this.loadSession(sessionId));
    }

    // 2. Next eligible routes not yet attempted.
    const routes = this.eligible(
      await routeCandidates(this.ctx.sql, project, { market: session.market, currency: session.currency, method: session.method }),
      session.amountMinor,
      session.currency,
      session.method,
      doc?.kind,
    );
    const tried = new Set(attempts.map((a) => a.providerAccountId));
    let attemptNumber = attempts.reduce((m, a) => Math.max(m, a.attemptNumber), 0);
    let lastError: "PROVIDER_REJECTED" | "PROVIDER_UNAVAILABLE" = "PROVIDER_REJECTED";
    if (attempts.some((a) => a.errorCode?.startsWith("MISCONFIGURED"))) lastError = "PROVIDER_UNAVAILABLE";

    for (const route of routes.filter((r) => !tried.has(r.providerAccountId))) {
      attemptNumber += 1;
      const attemptId = randomUUID();
      const idem = `${project.projectId}:${session.orderId}:${attemptNumber}`;
      try {
        await this.ctx.sql`
          INSERT INTO aro_payment_attempt (id, "tenantId", "projectId", "orderId", "checkoutSessionId", "attemptNumber",
            "providerAccountId", provider, "idempotencyKey", method, "amountMinor", currency, "routeSnapshot")
          VALUES (${attemptId}, ${session.tenantId}, ${session.projectId}, ${session.orderId}, ${session.id},
            ${attemptNumber}, ${route.providerAccountId}, ${route.provider}, ${idem}, ${session.method},
            ${session.amountMinor}, ${session.currency},
            ${this.ctx.sql.json({ route_id: route.routeId, priority: route.priority, rule_version: route.ruleVersion, policy: "PRIORITY_FAILOVER" })})`;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") {
          throw new AroError(409, "IDEMPOTENCY_CONFLICT", "Checkout creation already in progress; retry");
        }
        throw e;
      }
      const adapter = this.ctx.providers[route.provider];
      try {
        const result = await adapter.createPayment(this.adapterCtx(route), {
          attemptId,
          idempotencyKey: idem,
          orderId: session.orderId,
          amountMinor: session.amountMinor,
          currency: session.currency,
          method: session.method,
          payer: {
            name: input.payer.name,
            email: input.payer.email,
            ...(doc ? { document: doc.digits } : {}),
            ...(input.payer.phone ? { phone: input.payer.phone } : {}),
          },
          description: `${project.slug} ${session.offerSlug}`,
          webhookUrl: `${this.ctx.env.ARO_PUBLIC_BASE_URL.replace(/\/$/, "")}/v1/webhooks/providers/${route.provider}`,
        });
        await this.markPending(attemptId, result);
        return this.view(await this.loadSession(sessionId));
      } catch (e) {
        if (!(e instanceof ProviderError)) {
          // Unexpected local error after the provider may have acted: treat as ambiguous.
          this.ctx.log.error({ err: e, attemptId }, "unexpected error during provider create");
        }
        const err = e instanceof ProviderError ? e : new ProviderError("AMBIGUOUS", "LOCAL_ERROR", "unexpected");
        if (err.kind === "AMBIGUOUS") {
          await this.ctx.sql`
            UPDATE aro_payment_attempt SET state = 'UNKNOWN', "errorCode" = ${err.code}, "updatedAt" = now()
            WHERE id = ${attemptId}`;
          const [a] = await this.ctx.sql<AttemptRow[]>`SELECT * FROM aro_payment_attempt WHERE id = ${attemptId}`;
          const outcome = await this.recover(a!, route);
          if (outcome === "done") return this.view(await this.loadSession(sessionId));
          continue; // recovery proved nothing was created → safe to fail over
        }
        if (err.kind === "MISCONFIGURED") lastError = "PROVIDER_UNAVAILABLE";
        this.ctx.log.warn({ attemptId, provider: route.provider, code: err.code }, "provider rejected create");
        await this.markFailed(attemptId, `${err.kind}:${err.code}`);
      }
    }

    await this.ctx.sql.begin(async (tx) => {
      await tx`
        UPDATE aro_checkout_session SET state = 'FAILED', "lastErrorCode" = ${lastError}, "updatedAt" = now()
        WHERE id = ${sessionId} AND state = 'CREATED'`;
      await tx`UPDATE commerce_order SET status = 'cancelled' WHERE id = ${session.orderId} AND status = 'pending_payment'`;
      await audit(tx, { tenantId: session.tenantId, actor: "aro:router", action: "aro.checkout.failed", objectId: sessionId });
    });
    throw new AroError(PROVIDER_FAILURE_STATUS[lastError]!, lastError, "Payment could not be created with any provider");
  }

  /**
   * Ambiguous-create recovery: ask the provider whether the attempt exists.
   * "done" = the session now has an outcome; "absent" = provably not created.
   * If the provider cannot answer, abort WITHOUT failing over (a second
   * provider could double-charge); the client retries with the same key.
   */
  private async recover(a: AttemptRow, route: { providerAccountId: string; provider: ProviderKey; credentialRef: string }) {
    let snap: ProviderPaymentSnapshot | null;
    try {
      snap = await this.ctx.providers[route.provider].getPayment(this.adapterCtx(route), {
        ...(a.providerPaymentId ? { providerPaymentId: a.providerPaymentId } : {}),
        attemptId: a.id,
      });
    } catch {
      throw new AroError(503, "PROVIDER_UNAVAILABLE", "Payment provider unavailable; retry with the same Idempotency-Key");
    }
    if (!snap) {
      await this.markFailed(a.id, "NOT_CREATED");
      return "absent" as const;
    }
    if (snap.instruction && (snap.state === "PENDING" || snap.state === "APPROVED")) {
      await this.markPending(a.id, { ...snap, instruction: snap.instruction });
      return "done" as const;
    }
    if (snap.state === "APPROVED") {
      await this.ctx.sql`UPDATE aro_payment_attempt SET "providerPaymentId" = ${snap.providerPaymentId} WHERE id = ${a.id}`;
      await applyProviderSnapshot(this.ctx.sql, a.id, snap, `provider:${route.provider}`);
      return "done" as const;
    }
    // Exists but cannot be shown to the payer (no instruction) or already dead.
    await this.ctx.sql`UPDATE aro_payment_attempt SET "providerPaymentId" = ${snap.providerPaymentId} WHERE id = ${a.id}`;
    await this.markFailed(a.id, "RECOVERED_WITHOUT_INSTRUCTION");
    return "absent" as const;
  }

  private async markPending(attemptId: string, result: ProviderPaymentSnapshot & { instruction: PaymentInstruction }) {
    await this.ctx.sql.begin(async (tx) => {
      const [a] = await tx<AttemptRow[]>`
        UPDATE aro_payment_attempt SET state = 'PENDING', "providerPaymentId" = ${result.providerPaymentId},
          "providerStatus" = ${result.providerStatus}, "feeMinor" = ${result.feeMinor ?? null},
          "errorCode" = NULL, "updatedAt" = now()
        WHERE id = ${attemptId} AND state IN ('CREATED','UNKNOWN')
        RETURNING *`;
      if (!a) return;
      const expiresAt = "expires_at" in result.instruction ? result.instruction.expires_at : (result.expiresAt ?? null);
      await tx`
        UPDATE aro_checkout_session SET state = 'PENDING', "paymentInstruction" = ${tx.json(result.instruction)},
          "expiresAt" = ${expiresAt}, "updatedAt" = now()
        WHERE id = ${a.checkoutSessionId} AND state = 'CREATED'`;
      const project = await tx<Project[]>`
        SELECT "projectId", "tenantId", slug, "webhookUrl" FROM aro_project_config WHERE "projectId" = ${a.projectId}`;
      const [order] = await tx<{ contactId: string | null }[]>`SELECT "contactId" FROM commerce_order WHERE id = ${a.orderId}`;
      await enqueueEvent(tx, project[0]!, "payment.pending", `payment.pending:${a.id}`, {
        checkout_session_id: a.checkoutSessionId,
        order_id: a.orderId,
        customer_id: order?.contactId ?? null,
        payment: { id: a.id, state: "PENDING", method: a.method, amount: { amount_minor: a.amountMinor, currency: a.currency } },
      });
    });
    if (result.state !== "PENDING") {
      await applyProviderSnapshot(this.ctx.sql, attemptId, result, "aro:router");
    }
  }

  private async markFailed(attemptId: string, code: string) {
    await this.ctx.sql`
      UPDATE aro_payment_attempt SET state = 'FAILED', "errorCode" = ${code}, "updatedAt" = now()
      WHERE id = ${attemptId} AND state IN ('CREATED','UNKNOWN')`;
  }

  async loadSession(sessionId: string): Promise<SessionRow> {
    const [s] = await this.ctx.sql<SessionRow[]>`
      SELECT s.id, s."tenantId", s."projectId", s."orderId", o.slug AS "offerSlug", s."contactId", s."requestHash",
             s.state, s.market, s.method, s."amountMinor", s.currency, s."paymentInstruction", s."lastErrorCode",
             s."expiresAt", s."createdAt"
      FROM aro_checkout_session s JOIN aro_offer o ON o.id = s."offerId"
      WHERE s.id = ${sessionId}`;
    if (!s) throw new AroError(404, "NOT_FOUND", "Checkout session not found");
    return s;
  }

  async projectOfSession(sessionId: string) {
    const [row] = await this.ctx.sql<{ slug: string; allowedOrigins: string[] }[]>`
      SELECT c.slug, c."allowedOrigins" FROM aro_checkout_session s
      JOIN aro_project_config c ON c."projectId" = s."projectId" WHERE s.id = ${sessionId}`;
    return row;
  }

  /** OpenAPI CheckoutSession representation. */
  async view(s: SessionRow): Promise<CheckoutSessionView> {
    const [project] = await this.ctx.sql<{ slug: string }[]>`
      SELECT slug FROM aro_project_config WHERE "projectId" = ${s.projectId}`;
    return {
      id: s.id,
      order_id: s.orderId,
      project: project!.slug,
      offer: s.offerSlug,
      state: s.state,
      amount: { amount_minor: s.amountMinor, currency: s.currency },
      checkout_secret: checkoutSecretFor(this.ctx.keys.checkoutSecret, s.id),
      ...(s.paymentInstruction ? { payment: s.paymentInstruction } : {}),
      ...(s.expiresAt ? { expires_at: s.expiresAt.toISOString() } : {}),
      created_at: s.createdAt.toISOString(),
    };
  }
}
