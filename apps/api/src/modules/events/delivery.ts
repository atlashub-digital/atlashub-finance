import type { AroContext } from "../../context.js";
import { hmacSha256Hex } from "../../lib/crypto.js";

/** Bounded exponential backoff: 30s, 1m, 2m … capped at 6h; dead after MAX_ATTEMPTS (~1.5 days). */
export const MAX_ATTEMPTS = 12;
export const backoffSeconds = (attempt: number) => Math.min(30 * 2 ** (attempt - 1), 6 * 3600);
const LEASE_SECONDS = 120;

export function signProjectWebhook(secret: string, body: string, nowMs = Date.now()) {
  const timestamp = String(Math.floor(nowMs / 1000));
  return { timestamp, signature: `v1=${hmacSha256Hex(secret, `${timestamp}.${body}`)}` };
}

type Due = { id: string; eventId: string; endpointUrl: string; attempts: number; body: string; webhookSecretRef: string | null };

/**
 * Delivers due outbox rows (at-least-once). Rows are leased with
 * FOR UPDATE SKIP LOCKED + a short lease so several API replicas can run the
 * worker without double sending in the common case, and no DB lock is held
 * during HTTP. Consumers dedupe on X-ARO-Event-Id.
 */
export async function deliverDueWebhooks(ctx: AroContext, limit = 20) {
  const due = await ctx.sql.begin(async (tx) => {
    const rows = await tx<Due[]>`
      SELECT d.id, d."eventId", d."endpointUrl", d.attempts, e.body, c."webhookSecretRef"
      FROM aro_webhook_delivery d
      JOIN aro_outbound_event e ON e.id = d."eventId"
      JOIN aro_project_config c ON c."projectId" = e."projectId"
      WHERE d.status = 'pending' AND d."nextAttemptAt" <= now()
      ORDER BY d."nextAttemptAt"
      LIMIT ${limit}
      FOR UPDATE OF d SKIP LOCKED`;
    if (rows.length) {
      await tx`
        UPDATE aro_webhook_delivery SET "nextAttemptAt" = now() + make_interval(secs => ${LEASE_SECONDS})
        WHERE id = ANY(${rows.map((r) => r.id)})`;
    }
    return rows;
  });

  let delivered = 0;
  for (const d of due) {
    const attempt = d.attempts + 1;
    let statusCode: number | null = null;
    let error: string | null = null;
    const secret = d.webhookSecretRef ? ctx.secrets(d.webhookSecretRef, "secret") : undefined;
    if (!secret) {
      error = "WEBHOOK_SECRET_NOT_PROVISIONED";
    } else {
      const { timestamp, signature } = signProjectWebhook(secret, d.body);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await ctx.fetch(d.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "ARO-Webhook/1.0",
            "X-ARO-Event-Id": d.eventId,
            "X-ARO-Timestamp": timestamp,
            "X-ARO-Signature": signature,
          },
          body: d.body,
          signal: controller.signal,
          redirect: "manual",
        });
        statusCode = res.status;
        await res.body?.cancel().catch(() => {});
      } catch (e) {
        error = `NETWORK:${(e as Error).name}`;
      } finally {
        clearTimeout(timer);
      }
    }

    if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
      await ctx.sql`
        UPDATE aro_webhook_delivery SET status = 'delivered', attempts = ${attempt}, "lastStatusCode" = ${statusCode},
          "lastError" = NULL, "deliveredAt" = now()
        WHERE id = ${d.id}`;
      delivered += 1;
      continue;
    }
    const dead = attempt >= MAX_ATTEMPTS;
    await ctx.sql`
      UPDATE aro_webhook_delivery SET
        status = ${dead ? "dead" : "pending"}, attempts = ${attempt}, "lastStatusCode" = ${statusCode},
        "lastError" = ${error ?? `HTTP_${statusCode}`},
        "nextAttemptAt" = now() + make_interval(secs => ${backoffSeconds(attempt)})
      WHERE id = ${d.id}`;
    if (dead) ctx.log.error({ deliveryId: d.id, eventId: d.eventId }, "project webhook delivery dead-lettered");
  }
  return { attempted: due.length, delivered };
}

/** Manual replay (operator/Infrastructure): re-arms a delivered or dead delivery. */
export async function replayDelivery(ctx: Pick<AroContext, "sql">, eventId: string) {
  return ctx.sql`
    UPDATE aro_webhook_delivery SET status = 'pending', attempts = 0, "nextAttemptAt" = now(), "lastError" = NULL
    WHERE "eventId" = ${eventId} RETURNING id`;
}
