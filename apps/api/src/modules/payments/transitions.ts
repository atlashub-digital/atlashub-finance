import { audit } from "../../audit/audit.js";
import type { Db, Sql } from "../../db/client.js";
import type { AttemptState, ProviderPaymentSnapshot } from "../../providers/types.js";
import { grantOrderEntitlements, revokeOrderEntitlements } from "../entitlements/service.js";
import { enqueueEvent } from "../events/outbox.js";
import { findProjectById } from "../projects/repo.js";

/**
 * Payment state machine. The only place where provider evidence turns into
 * commercial state (payment → order → entitlement → outbound events).
 *
 * Every transition runs in one transaction holding row locks on the attempt,
 * its checkout session and its order, so duplicate/concurrent webhooks and
 * the reconciler serialize and the second one becomes a no-op.
 */

export type AttemptRow = {
  id: string;
  tenantId: string;
  projectId: string;
  orderId: string;
  checkoutSessionId: string;
  attemptNumber: number;
  providerAccountId: string;
  provider: string;
  providerPaymentId: string | null;
  idempotencyKey: string;
  state: AttemptState;
  method: "PIX" | "CARD";
  amountMinor: number;
  currency: string;
  feeMinor: number | null;
  errorCode: string | null;
  createdAt: Date;
};

const LIVE: AttemptState[] = ["CREATED", "UNKNOWN", "PENDING"];
const SETTLED_FAILURE: AttemptState[] = ["FAILED", "CANCELED", "EXPIRED"];

/** Allowed attempt transitions. Provider proof of payment wins over local expiry/failure. */
export function canTransition(from: AttemptState, to: AttemptState): boolean {
  if (from === to) return false;
  switch (to) {
    case "PENDING":
      return from === "CREATED" || from === "UNKNOWN";
    case "APPROVED":
      return LIVE.includes(from) || SETTLED_FAILURE.includes(from);
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return LIVE.includes(from);
    case "REFUNDED":
    case "CHARGEBACK":
      return from === "APPROVED";
    default:
      return false;
  }
}

/** Canonical order status (OpenAPI Order.status) from commerce_order.status. */
export function orderStatusFromDb(status: string): "PENDING" | "APPROVED" | "CANCELED" | "REFUNDED" | "CHARGEBACK" {
  switch (status) {
    case "paid":
    case "fulfilling":
    case "fulfilled":
      return "APPROVED";
    case "cancelled":
      return "CANCELED";
    case "refunded":
      return "REFUNDED";
    case "chargeback":
      return "CHARGEBACK";
    default:
      return "PENDING";
  }
}

type OrderRow = { id: string; tenantId: string; projectId: string; contactId: string | null; status: string };
type SessionRow = { id: string; state: string };

const paymentData = (a: AttemptRow, state: AttemptState, order: OrderRow) => ({
  checkout_session_id: a.checkoutSessionId,
  order_id: a.orderId,
  customer_id: order.contactId,
  payment: {
    id: a.id,
    state,
    method: a.method,
    amount: { amount_minor: a.amountMinor, currency: a.currency },
  },
});

export type TransitionResult = { changed: boolean; state: AttemptState; reason?: string };

/**
 * Applies a provider snapshot (verified webhook or provider fetch) to an
 * attempt. Idempotent: same-state or disallowed transitions are no-ops.
 */
export async function applyProviderSnapshot(
  sql: Sql,
  attemptId: string,
  snap: Pick<ProviderPaymentSnapshot, "state" | "providerStatus" | "amountMinor" | "currency" | "feeMinor" | "netMinor">,
  actor: string,
): Promise<TransitionResult> {
  return sql.begin(async (tx) => {
    const [a] = await tx<AttemptRow[]>`SELECT * FROM aro_payment_attempt WHERE id = ${attemptId} FOR UPDATE`;
    if (!a) throw new Error(`attempt ${attemptId} not found`);
    const [order] = await tx<OrderRow[]>`
      SELECT id, "tenantId", "projectId", "contactId", status FROM commerce_order WHERE id = ${a.orderId} FOR UPDATE`;
    const [session] = await tx<SessionRow[]>`
      SELECT id, state FROM aro_checkout_session WHERE id = ${a.checkoutSessionId} FOR UPDATE`;
    if (!order || !session) throw new Error(`attempt ${attemptId} has no order/session`);
    const to = snap.state;

    if (to === a.state || !canTransition(a.state, to)) {
      await tx`
        UPDATE aro_payment_attempt SET "providerStatus" = ${snap.providerStatus},
          "feeMinor" = COALESCE("feeMinor", ${snap.feeMinor ?? null}),
          "netMinor" = COALESCE("netMinor", ${snap.netMinor ?? null})
        WHERE id = ${a.id}`;
      return { changed: false, state: a.state, reason: to === a.state ? "same_state" : "not_allowed" };
    }

    if (to === "APPROVED") {
      const amountOk = snap.amountMinor === undefined || snap.amountMinor === a.amountMinor;
      const currencyOk = snap.currency === undefined || snap.currency === a.currency;
      if (!amountOk || !currencyOk) {
        await tx`
          UPDATE aro_payment_attempt SET "errorCode" = 'AMOUNT_MISMATCH', "providerStatus" = ${snap.providerStatus},
            "updatedAt" = now() WHERE id = ${a.id}`;
        await audit(tx, { tenantId: a.tenantId, actor, action: "aro.payment.amount_mismatch", objectId: a.id });
        return { changed: false, state: a.state, reason: "amount_mismatch" };
      }
    }

    await tx`
      UPDATE aro_payment_attempt SET
        state = ${to},
        "providerStatus" = ${snap.providerStatus},
        "feeMinor" = COALESCE(${snap.feeMinor ?? null}, "feeMinor"),
        "netMinor" = COALESCE(${snap.netMinor ?? null}, "netMinor"),
        "approvedAt" = CASE WHEN ${to} = 'APPROVED' THEN now() ELSE "approvedAt" END,
        "reversedAt" = CASE WHEN ${to} IN ('REFUNDED','CHARGEBACK') THEN now() ELSE "reversedAt" END,
        "updatedAt" = now()
      WHERE id = ${a.id}`;
    await audit(tx, { tenantId: a.tenantId, actor, action: `aro.payment.${to.toLowerCase()}`, objectId: a.id });

    const project = await findProjectById(tx, a.projectId);
    if (!project) throw new Error(`project ${a.projectId} missing`);
    await effects(tx, project, a, to, order, session, actor);
    return { changed: true, state: to };
  });
}

async function effects(
  tx: Db,
  project: NonNullable<Awaited<ReturnType<typeof findProjectById>>>,
  a: AttemptRow,
  to: AttemptState,
  order: OrderRow,
  session: SessionRow,
  actor: string,
) {
  if (to === "PENDING") {
    await enqueueEvent(tx, project, "payment.pending", `payment.pending:${a.id}`, paymentData(a, to, order));
    return;
  }

  if (to === "APPROVED") {
    const [other] = await tx`
      SELECT id FROM aro_payment_attempt
      WHERE "orderId" = ${a.orderId} AND id <> ${a.id} AND state IN ('APPROVED','REFUNDED','CHARGEBACK')`;
    if (other) {
      // Second provider confirmed for the same order: money in twice. Never
      // double-grant; flag for operator refund.
      await tx`UPDATE aro_payment_attempt SET "errorCode" = 'DUPLICATE_PAYMENT' WHERE id = ${a.id}`;
      await audit(tx, { tenantId: a.tenantId, actor, action: "aro.payment.duplicate", objectId: a.id });
      return;
    }
    await tx`UPDATE commerce_order SET status = 'paid', "approvedAt" = now() WHERE id = ${a.orderId}`;
    await tx`UPDATE aro_checkout_session SET state = 'APPROVED', "updatedAt" = now() WHERE id = ${session.id}`;
    const granted = await grantOrderEntitlements(tx, order);
    await audit(tx, { tenantId: a.tenantId, actor, action: "aro.order.approved", objectId: a.orderId });
    await enqueueEvent(tx, project, "payment.approved", `payment.approved:${a.id}`, paymentData(a, to, order));
    await enqueueEvent(tx, project, "order.approved", `order.approved:${a.orderId}`, {
      checkout_session_id: a.checkoutSessionId,
      order_id: a.orderId,
      customer_id: order.contactId,
      amount: { amount_minor: a.amountMinor, currency: a.currency },
    });
    if (granted.length) {
      await enqueueEvent(tx, project, "entitlement.granted", `entitlement.granted:${a.orderId}`, {
        order_id: a.orderId,
        customer_id: order.contactId,
        entitlements: granted,
      });
    }
    return;
  }

  if (SETTLED_FAILURE.includes(to)) {
    const [live] = await tx`
      SELECT id FROM aro_payment_attempt
      WHERE "checkoutSessionId" = ${session.id} AND id <> ${a.id}
        AND state IN ('CREATED','UNKNOWN','PENDING','APPROVED','REFUNDED','CHARGEBACK')`;
    if (!live && (session.state === "PENDING" || session.state === "CREATED")) {
      await tx`UPDATE aro_checkout_session SET state = ${to}, "updatedAt" = now() WHERE id = ${session.id}`;
      await tx`UPDATE commerce_order SET status = 'cancelled' WHERE id = ${a.orderId} AND status = 'pending_payment'`;
    }
    await enqueueEvent(tx, project, "payment.failed", `payment.failed:${a.id}`, paymentData(a, to, order));
    return;
  }

  if (to === "REFUNDED" || to === "CHARGEBACK") {
    const kind = to === "REFUNDED" ? "REFUND" : "CHARGEBACK";
    await tx`
      INSERT INTO aro_refund (id, "tenantId", "projectId", "paymentAttemptId", "orderId", kind, "amountMinor", currency)
      VALUES (gen_random_uuid()::text, ${a.tenantId}, ${a.projectId}, ${a.id}, ${a.orderId}, ${kind}, ${a.amountMinor}, ${a.currency})
      ON CONFLICT ("paymentAttemptId", kind) DO NOTHING`;
    const type = to === "REFUNDED" ? "payment.refunded" : "payment.chargeback";
    await enqueueEvent(tx, project, type, `${type}:${a.id}`, paymentData(a, to, order));
    if (a.errorCode === "DUPLICATE_PAYMENT") return; // the order is backed by another payment
    await tx`UPDATE commerce_order SET status = ${to === "REFUNDED" ? "refunded" : "chargeback"} WHERE id = ${a.orderId}`;
    await tx`UPDATE aro_checkout_session SET state = ${to}, "updatedAt" = now() WHERE id = ${session.id}`;
    const revoked = await revokeOrderEntitlements(tx, order);
    if (revoked.length) {
      await audit(tx, { tenantId: a.tenantId, actor, action: "aro.entitlement.revoked", objectId: a.orderId });
      await enqueueEvent(tx, project, "entitlement.revoked", `entitlement.revoked:${a.orderId}`, {
        order_id: a.orderId,
        customer_id: order.contactId,
        entitlements: revoked,
        reason: kind,
      });
    }
  }
}
