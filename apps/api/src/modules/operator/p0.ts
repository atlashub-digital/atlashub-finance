import type { Db } from "../../db/client.js";

/**
 * P0 operational snapshot for Hermes and the future financial frontend.
 * Aggregates by project/currency; no names, email, documents, keys or payment secrets.
 * APPROVED volume != provider settled/withdrawable balance.
 */
export async function p0OperationsSnapshot(db: Db, q: {
  projectId: string; slug: string; currency: string; from: Date; to: Date;
}) {
  const [totals] = await db<Array<{
    approved: number; gross: string; fee: string; fee_missing: number; pending: number;
    unknown: number; failed: number; stale: number;
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE state IN ('APPROVED','REFUNDED','CHARGEBACK') AND "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to})::int AS approved,
      COALESCE(SUM("amountMinor") FILTER (WHERE state IN ('APPROVED','REFUNDED','CHARGEBACK') AND "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to}),0)::text AS gross,
      COALESCE(SUM("feeMinor") FILTER (WHERE state IN ('APPROVED','REFUNDED','CHARGEBACK') AND "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to}),0)::text AS fee,
      COUNT(*) FILTER (WHERE state IN ('APPROVED','REFUNDED','CHARGEBACK') AND "feeMinor" IS NULL AND "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to})::int AS fee_missing,
      COUNT(*) FILTER (WHERE state='PENDING')::int AS pending,
      COUNT(*) FILTER (WHERE state='UNKNOWN')::int AS unknown,
      COUNT(*) FILTER (WHERE state='FAILED' AND "createdAt" >= ${q.from} AND "createdAt" < ${q.to})::int AS failed,
      COUNT(*) FILTER (WHERE state IN ('PENDING','UNKNOWN') AND "updatedAt" < now()-interval '10 minutes')::int AS stale
    FROM aro_payment_attempt
    WHERE "projectId"=${q.projectId} AND currency=${q.currency}
  `;
  const [refund] = await db<Array<{total: string; count: number}>>`
    SELECT COALESCE(SUM("amountMinor"),0)::text AS total, COUNT(*)::int AS count
    FROM aro_refund
    WHERE "projectId"=${q.projectId} AND currency=${q.currency}
      AND "createdAt" >= ${q.from} AND "createdAt" < ${q.to}
  `;
  const [orders] = await db<Array<{created: number; confirmed: number}>>`
    SELECT
      COUNT(*) FILTER (WHERE "createdAt" >= ${q.from} AND "createdAt" < ${q.to})::int AS created,
      COUNT(*) FILTER (WHERE "approvedAt" >= ${q.from} AND "approvedAt" < ${q.to})::int AS confirmed
    FROM commerce_order
    WHERE "projectId"=${q.projectId} AND currency=${q.currency}
  `;
  const [deliveries] = await db<Array<{pending: number; dead: number}>>`
    SELECT
      COUNT(*) FILTER (WHERE w.status IN ('pending','retry','failed'))::int AS pending,
      COUNT(*) FILTER (WHERE w.status='dead')::int AS dead
    FROM aro_webhook_delivery w JOIN aro_outbound_event e ON e.id=w."eventId"
    WHERE e."projectId"=${q.projectId}
  `;
  const [config] = await db<Array<{api_keys: number; webhooks: number; routes: number; status: string|null}>>`
    SELECT
      (SELECT COUNT(*)::int FROM aro_api_key WHERE "projectId"=${q.projectId} AND "revokedAt" IS NULL) AS api_keys,
      (SELECT COUNT(*)::int FROM aro_project_config WHERE "projectId"=${q.projectId} AND "webhookUrl" IS NOT NULL) AS webhooks,
      (SELECT COUNT(*)::int FROM aro_payment_route WHERE ("projectId" IS NULL OR "projectId"=${q.projectId}) AND active=true) AS routes,
      (SELECT status FROM aro_project_config WHERE "projectId"=${q.projectId} LIMIT 1) AS status
  `;
  const gross = BigInt(totals?.gross || "0");
  const fees = BigInt(totals?.fee || "0");
  const refunds = BigInt(refund?.total || "0");
  const money = (v: bigint) => ({amount_minor:v.toString(),currency:q.currency});
  return {
    project:q.slug, generated_at:new Date().toISOString(),
    period:{from:q.from.toISOString(),to:q.to.toISOString()},currency:q.currency,
    orders:{created:orders?.created??0,confirmed:orders?.confirmed??0},
    payments:{approved:totals?.approved??0,pending:totals?.pending??0,unknown:totals?.unknown??0,
      failed:totals?.failed??0,stale_pending_or_unknown:totals?.stale??0},
    webhooks:{undelivered:deliveries?.pending??0,dead:deliveries?.dead??0},
    configuration:{project_status:config?.status??"missing",active_api_keys:config?.api_keys??0,
      webhook_endpoints:config?.webhooks??0,active_routes:config?.routes??0},
    financial:{gross_approved:money(gross),observed_provider_fees:money(fees),
      fee_data_missing_count:totals?.fee_missing??0,refunds:money(refunds),
      net_after_known_fees_and_refunds:money(gross-fees-refunds),
      estimated_only:true,settled_balance_available:false},
    alerts:{
      payment_exceptions:(totals?.stale??0)+(totals?.unknown??0),
      delivery_exceptions:(deliveries?.pending??0)+(deliveries?.dead??0),
      missing_webhook:(config?.webhooks??0)===0,
    },
  };
}
