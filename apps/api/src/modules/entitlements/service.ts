import { randomUUID } from "node:crypto";
import type { Db } from "../../db/client.js";

/**
 * Grants every entitlement key carried by the order's items. Idempotent via
 * the existing UNIQUE (tenantId, key, source, sourceId) with source = 'order'.
 * Returns only the keys newly granted by this call.
 */
export async function grantOrderEntitlements(
  tx: Db,
  order: { id: string; tenantId: string; projectId: string; contactId: string | null },
): Promise<string[]> {
  const items = await tx<{ entitlementKeys: string[] }[]>`
    SELECT "entitlementKeys" FROM aro_order_item WHERE "orderId" = ${order.id}`;
  const keys = [...new Set(items.flatMap((i) => i.entitlementKeys))].sort();
  const granted: string[] = [];
  for (const key of keys) {
    const [row] = await tx<{ key: string }[]>`
      INSERT INTO commerce_entitlement (id, "tenantId", key, source, "sourceId", "projectId", "contactId", status, "validFrom")
      VALUES (${randomUUID()}, ${order.tenantId}, ${key}, 'order', ${order.id}, ${order.projectId},
              ${order.contactId}, 'active', (now() AT TIME ZONE 'UTC'))
      ON CONFLICT ("tenantId", key, source, "sourceId") DO NOTHING
      RETURNING key`;
    if (row) granted.push(row.key);
  }
  return granted;
}

/** Revokes the order's active entitlements; returns the keys revoked by this call. */
export async function revokeOrderEntitlements(tx: Db, order: { id: string; tenantId: string }): Promise<string[]> {
  const rows = await tx<{ key: string }[]>`
    UPDATE commerce_entitlement SET status = 'revoked', "revokedAt" = now()
    WHERE "tenantId" = ${order.tenantId} AND source = 'order' AND "sourceId" = ${order.id} AND status = 'active'
    RETURNING key`;
  return rows.map((r) => r.key).sort();
}

export type ResolvedEntitlement = {
  key: string;
  status: "ACTIVE";
  source_order_id: string;
  starts_at: string;
  expires_at?: string;
};

/** Active entitlement set for a project customer (authoritative access check). */
export async function resolveEntitlements(
  db: Db,
  project: { projectId: string },
  contactId: string,
): Promise<ResolvedEntitlement[]> {
  const rows = await db<{ key: string; sourceId: string; startsAt: Date; expiresAt: Date | null }[]>`
    SELECT key, "sourceId",
           ("validFrom" AT TIME ZONE 'UTC') AS "startsAt",
           ("validUntil" AT TIME ZONE 'UTC') AS "expiresAt"
    FROM commerce_entitlement
    WHERE "projectId" = ${project.projectId} AND "contactId" = ${contactId} AND status = 'active'
      AND "validFrom" <= (now() AT TIME ZONE 'UTC')
      AND ("validUntil" IS NULL OR "validUntil" > (now() AT TIME ZONE 'UTC'))
    ORDER BY key, "validFrom"`;
  return rows.map((r) => ({
    key: r.key,
    status: "ACTIVE" as const,
    source_order_id: r.sourceId,
    starts_at: r.startsAt.toISOString(),
    ...(r.expiresAt ? { expires_at: r.expiresAt.toISOString() } : {}),
  }));
}
