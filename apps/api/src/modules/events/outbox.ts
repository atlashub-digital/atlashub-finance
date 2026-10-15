import { randomUUID } from "node:crypto";
import type { Db } from "../../db/client.js";
import type { Project } from "../projects/repo.js";

/** Event names from openapi/aro-v1.yaml ProjectEvent.type. */
export type ProjectEventType =
  | "checkout.started"
  | "payment.pending"
  | "payment.approved"
  | "payment.failed"
  | "payment.refunded"
  | "payment.chargeback"
  | "order.approved"
  | "entitlement.granted"
  | "entitlement.revoked";

/**
 * Writes a normalized project event to the durable outbox inside the caller's
 * transaction. dedupeKey makes emission idempotent (duplicate provider events
 * or retries never produce a second event). A delivery row is created only
 * when the project has a webhook endpoint; the event is stored regardless.
 */
export async function enqueueEvent(
  tx: Db,
  project: Pick<Project, "projectId" | "tenantId" | "slug" | "webhookUrl">,
  type: ProjectEventType,
  dedupeKey: string,
  data: Record<string, unknown>,
): Promise<string | undefined> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const body = JSON.stringify({ id, type, created_at: createdAt, project: project.slug, data });
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO aro_outbound_event (id, "tenantId", "projectId", type, "dedupeKey", body, "createdAt")
    VALUES (${id}, ${project.tenantId}, ${project.projectId}, ${type}, ${dedupeKey}, ${body}, ${createdAt})
    ON CONFLICT ("dedupeKey") DO NOTHING
    RETURNING id`;
  if (!row) return undefined;
  if (project.webhookUrl) {
    await tx`
      INSERT INTO aro_webhook_delivery (id, "eventId", "endpointUrl")
      VALUES (${randomUUID()}, ${id}, ${project.webhookUrl})
      ON CONFLICT DO NOTHING`;
  }
  return id;
}
