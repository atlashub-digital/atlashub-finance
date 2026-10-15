import type { AroContext } from "../../context.js";
import type { ProviderKey } from "../../providers/types.js";
import { type AttemptRow, applyProviderSnapshot } from "./transitions.js";

/**
 * Safety net for lost or failed provider webhooks: re-reads provider truth for
 * attempts that have been PENDING for a while. UNKNOWN attempts are only
 * advanced when the provider reports money received; otherwise they are left
 * to the checkout resume path.
 */
export async function reconcilePendingAttempts(ctx: AroContext, opts: { olderThanSec?: number; limit?: number } = {}) {
  const rows = await ctx.sql<(AttemptRow & { credentialRef: string })[]>`
    SELECT a.*, p."credentialRef" FROM aro_payment_attempt a
    JOIN aro_provider_account p ON p.id = a."providerAccountId"
    WHERE a.state IN ('PENDING','UNKNOWN')
      AND a."updatedAt" < now() - make_interval(secs => ${opts.olderThanSec ?? 120})
      AND a."createdAt" > now() - interval '3 days'
    ORDER BY a."updatedAt"
    LIMIT ${opts.limit ?? 50}`;
  let changed = 0;
  for (const a of rows) {
    const provider = a.provider as ProviderKey;
    const actx = { account: { id: a.providerAccountId, provider, credentialRef: a.credentialRef }, secrets: ctx.secrets };
    try {
      const snap = await ctx.providers[provider].getPayment(actx, {
        ...(a.providerPaymentId ? { providerPaymentId: a.providerPaymentId } : {}),
        attemptId: a.id,
      });
      if (snap && (a.state === "PENDING" || snap.state === "APPROVED")) {
        if (!a.providerPaymentId) {
          await ctx.sql`UPDATE aro_payment_attempt SET "providerPaymentId" = ${snap.providerPaymentId} WHERE id = ${a.id}`;
        }
        const r = await applyProviderSnapshot(ctx.sql, a.id, snap, "aro:reconciler");
        if (r.changed) {
          changed += 1;
          continue;
        }
      }
    } catch (e) {
      ctx.log.warn({ attemptId: a.id, provider, err: (e as Error).message }, "reconcile lookup failed");
    }
    // Rotate to the back of the queue.
    await ctx.sql`UPDATE aro_payment_attempt SET "updatedAt" = now() WHERE id = ${a.id} AND state = ${a.state}`;
  }
  return { checked: rows.length, changed };
}
