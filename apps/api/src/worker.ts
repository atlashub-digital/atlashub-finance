import type { AroContext } from "./context.js";
import { deliverDueWebhooks } from "./modules/events/delivery.js";
import { reconcilePendingAttempts } from "./modules/payments/reconciler.js";

/**
 * In-process background loops (no Redis/queue infra in V1):
 *   - outbox delivery every 5s;
 *   - provider reconciliation of stale PENDING attempts every 60s.
 * Each loop never overlaps itself; errors are logged and retried next tick.
 */
export function startWorkers(ctx: AroContext) {
  const loop = (name: string, everyMs: number, fn: () => Promise<unknown>) => {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await fn();
      } catch (e) {
        ctx.log.error({ err: e, worker: name }, "worker iteration failed");
      } finally {
        running = false;
      }
    }, everyMs);
    timer.unref();
    return timer;
  };
  const timers = [
    loop("outbox", 5_000, () => deliverDueWebhooks(ctx)),
    loop("reconciler", 60_000, () => reconcilePendingAttempts(ctx)),
  ];
  return () => timers.forEach(clearInterval);
}
