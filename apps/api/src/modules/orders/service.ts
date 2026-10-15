import type { Db } from "../../db/client.js";
import { orderStatusFromDb } from "../payments/transitions.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** OpenAPI Order for a project-owned order, or undefined (never leaks other projects). */
export async function getOrder(db: Db, projectId: string, orderId: string) {
  if (!UUID.test(orderId)) return undefined;
  const [o] = await db<
    { id: string; status: string; currency: string; totalMinor: number; contactId: string | null; createdAt: Date; approvedAt: Date | null }[]
  >`
    SELECT id, status, currency, "totalMinor", "contactId", ("createdAt" AT TIME ZONE 'UTC') AS "createdAt", "approvedAt"
    FROM commerce_order WHERE id = ${orderId} AND "projectId" = ${projectId}`;
  if (!o) return undefined;
  const items = await db<{ offer: string; productId: string; title: string; quantity: number; unitAmountMinor: number; currency: string }[]>`
    SELECT f.slug AS offer, i."productId", i.title, i.quantity, i."unitAmountMinor", i.currency
    FROM aro_order_item i JOIN aro_offer f ON f.id = i."offerId"
    WHERE i."orderId" = ${orderId} ORDER BY i.id`;
  const [project] = await db<{ slug: string }[]>`SELECT slug FROM aro_project_config WHERE "projectId" = ${projectId}`;
  return {
    id: o.id,
    project: project!.slug,
    status: orderStatusFromDb(o.status),
    amount: { amount_minor: o.totalMinor, currency: o.currency },
    items: items.map((i) => ({
      offer: i.offer,
      product: i.productId,
      title: i.title,
      quantity: i.quantity,
      unit_amount: { amount_minor: i.unitAmountMinor, currency: i.currency },
    })),
    ...(o.contactId ? { customer_id: o.contactId } : {}),
    created_at: o.createdAt.toISOString(),
    ...(o.approvedAt ? { approved_at: o.approvedAt.toISOString() } : {}),
  };
}
