import { randomUUID } from "node:crypto";
import type { AroContext } from "../../context.js";
import { sha256Hex } from "../../lib/crypto.js";
import { AroError } from "../../lib/errors.js";
import {
  type NormalizedWebhook,
  type ProviderKey,
  type ProviderPaymentSnapshot,
  type RawWebhook,
  WebhookRejectedError,
} from "../../providers/types.js";
import { type AttemptRow, applyProviderSnapshot } from "./transitions.js";

type Account = { id: string; tenantId: string; provider: ProviderKey; credentialRef: string };

export type IngestOutcome = { status: "processed" | "ignored" | "duplicate" | "failed"; detail?: string };

/**
 * Provider webhook ingress. Order of operations:
 *   1. verify against each non-disabled account of the provider (SIGNED);
 *   2. persist to the shared inbox (billing_webhook_event), dedupe on
 *      (provider, eventId) — duplicates are acknowledged and ignored;
 *   3. resolve the attempt; VERIFIED_BY_FETCH providers are re-read;
 *   4. apply through the payment state machine.
 * Failures after verification are recorded on the inbox row and the attempt
 * stays eligible for the reconciler, so a lost/failed webhook is not fatal.
 */
export async function ingestProviderWebhook(ctx: AroContext, provider: ProviderKey, raw: RawWebhook): Promise<IngestOutcome> {
  const adapter = ctx.providers[provider];
  const accounts = await ctx.sql<Account[]>`
    SELECT id, "tenantId", provider, "credentialRef" FROM aro_provider_account
    WHERE provider = ${provider} AND status <> 'disabled' ORDER BY "createdAt"`;
  if (!accounts.length) throw new AroError(400, "INVALID_REQUEST", "Provider not configured");

  let normalized: NormalizedWebhook | undefined;
  let account: Account | undefined;
  let lastError = "unverified";
  for (const acc of accounts) {
    try {
      normalized = adapter.parseWebhook({ account: acc, secrets: ctx.secrets }, raw);
      account = acc;
      break;
    } catch (e) {
      if (!(e instanceof WebhookRejectedError)) throw e;
      lastError = e.message;
    }
  }
  if (!normalized || !account) {
    ctx.log.warn({ provider, reason: lastError }, "provider webhook rejected");
    throw new AroError(400, "INVALID_REQUEST", "Webhook verification failed");
  }

  const inboxId: string = randomUUID();
  const [inserted] = await ctx.sql<{ id: string }[]>`
    INSERT INTO billing_webhook_event (id, provider, "eventId", "eventType", "providerRef", "payloadSha256", facts,
      status, "tenantId", "trustLevel")
    VALUES (${inboxId}, ${provider}, ${normalized.eventId}, ${normalized.eventType},
      ${normalized.providerPaymentId ?? null}, ${sha256Hex(raw.rawBody)}, ${ctx.sql.json(normalized.facts as never)},
      'received', ${account.tenantId}, ${normalized.trust})
    ON CONFLICT (provider, "eventId") DO NOTHING
    RETURNING id`;
  let rowId = inboxId;
  if (!inserted) {
    const [prior] = await ctx.sql<{ id: string; status: string }[]>`
      SELECT id, status FROM billing_webhook_event WHERE provider = ${provider} AND "eventId" = ${normalized.eventId}`;
    if (prior && (prior.status === "processed" || prior.status === "ignored")) return { status: "duplicate" };
    rowId = prior!.id; // earlier processing failed: retry it
  }

  const finish = async (status: "processed" | "ignored" | "failed", extra: { attempt?: AttemptRow; error?: string; type?: string }) => {
    await ctx.sql`
      UPDATE billing_webhook_event SET status = ${status}, attempts = attempts + 1, error = ${extra.error ?? null},
        "processedAt" = (now() AT TIME ZONE 'UTC'),
        "paymentAttemptId" = ${extra.attempt?.id ?? null}, "projectId" = ${extra.attempt?.projectId ?? null},
        "normalizedType" = ${extra.type ?? null}
      WHERE id = ${rowId}`;
    return { status, ...(extra.error ? { detail: extra.error } : {}) } as IngestOutcome;
  };

  if (normalized.trust === "UNTRUSTED") return finish("ignored", { error: "UNTRUSTED_EVENT", type: "PROVIDER_RISK_EVENT" });

  const [attempt] = await ctx.sql<AttemptRow[]>`
    SELECT * FROM aro_payment_attempt
    WHERE provider = ${provider} AND (
      (${normalized.providerPaymentId ?? null}::text IS NOT NULL AND "providerPaymentId" = ${normalized.providerPaymentId ?? null})
      OR (${normalized.attemptId ?? null}::text IS NOT NULL AND id = ${normalized.attemptId ?? null}))
    LIMIT 1`;
  if (!attempt) return finish("ignored", { error: "UNKNOWN_PAYMENT" });

  let snapshot: ProviderPaymentSnapshot | undefined | null = normalized.snapshot;
  if (normalized.trust === "VERIFIED_BY_FETCH") {
    try {
      snapshot = await adapter.getPayment(
        { account, secrets: ctx.secrets },
        { ...(attempt.providerPaymentId ? { providerPaymentId: attempt.providerPaymentId } : {}), attemptId: attempt.id },
      );
    } catch (e) {
      return finish("failed", { attempt, error: `FETCH_FAILED:${(e as Error).message}` });
    }
  }
  if (!snapshot) return finish("ignored", { attempt, error: "NO_STATE" });

  const result = await applyProviderSnapshot(ctx.sql, attempt.id, snapshot, `provider:${provider}`);
  if (normalized.trust === "VERIFIED_BY_FETCH" && !result.changed && snapshot.state === "PENDING") {
    // The signal said something changed but the fetch still reads PENDING
    // (provider-side caching). Keep the inbox row retryable; a re-sent signal
    // or the reconciler will re-fetch.
    return finish("failed", { attempt, error: "STALE_FETCH_PENDING" });
  }
  return finish("processed", { attempt, type: `PAYMENT_${snapshot.state}`, ...(result.reason ? { error: result.reason } : {}) });
}
