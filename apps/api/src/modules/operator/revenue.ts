import type { Db } from "../../db/client.js";

/**
 * Revenue overview (Hermes revenue_overview tool, docs/36).
 * - gross: payments approved in the period, in reporting_currency only
 *   (no implicit FX: other currencies are excluded, never converted);
 * - refunds: reversals of those same payments (cohort), so net >= 0;
 * - orders: orders created in the period; approved_orders: approved in period.
 */
export async function revenueOverview(
  db: Db,
  q: { projectId: string; slug: string; from: Date; to: Date; currency: string },
) {
  const [pay] = await db<{ gross: number; refunds: number }[]>`
    SELECT COALESCE(SUM(a."amountMinor"), 0)::bigint AS gross,
           COALESCE(SUM(r."amountMinor"), 0)::bigint AS refunds
    FROM aro_payment_attempt a
    LEFT JOIN aro_refund r ON r."paymentAttemptId" = a.id
    WHERE a."projectId" = ${q.projectId} AND a.currency = ${q.currency}
      AND a."approvedAt" >= ${q.from} AND a."approvedAt" < ${q.to}
      AND a.state IN ('APPROVED','REFUNDED','CHARGEBACK')`;
  const [ord] = await db<{ orders: number; approved: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE ("createdAt" AT TIME ZONE 'UTC') >= ${q.from} AND ("createdAt" AT TIME ZONE 'UTC') < ${q.to})::int AS orders,
      COUNT(*) FILTER (WHERE "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to})::int AS approved
    FROM commerce_order WHERE "projectId" = ${q.projectId} AND currency = ${q.currency}`;
  const gross = pay?.gross ?? 0;
  const refunds = pay?.refunds ?? 0;
  const approved = ord?.approved ?? 0;
  const money = (amount_minor: number) => ({ amount_minor, currency: q.currency });
  return {
    project: q.slug,
    period: { from: q.from.toISOString(), to: q.to.toISOString() },
    gross: money(gross),
    refunds: money(refunds),
    net: money(gross - refunds),
    orders: ord?.orders ?? 0,
    approved_orders: approved,
    aov: money(approved > 0 ? Math.floor(gross / approved) : 0),
  };
}
