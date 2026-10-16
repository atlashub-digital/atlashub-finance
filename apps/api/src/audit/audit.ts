import { randomUUID } from "node:crypto";
import type { Db } from "../db/client.js";

/**
 * Audit trail on the shared AtlasHub AuditEvent table.
 * action is namespaced "aro.<object>.<verb>"; never contains PII or secrets.
 */
export async function audit(db: Db, e: { tenantId: string; actor: string; action: string; objectId: string }) {
  await db`
    INSERT INTO "AuditEvent" (id, "tenantId", "actorId", action, "objectId")
    VALUES (${randomUUID()}, ${e.tenantId}, ${e.actor}, ${e.action}, ${e.objectId})`;
}
