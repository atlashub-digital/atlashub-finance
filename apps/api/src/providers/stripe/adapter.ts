import { hmacSha256Hex, safeEqualHex } from "../../lib/crypto.js";
import { requireSecret } from "../../security/secrets.js";
import { type FetchLike, isObj, requestJson, str } from "../http.js";
import {
  type AdapterContext,
  type AttemptState,
  type CreatePaymentInput,
  type NormalizedWebhook,
  type PaymentProviderAdapter,
  ProviderError,
  type ProviderPaymentSnapshot,
  type RawWebhook,
  WebhookRejectedError,
  header,
} from "../types.js";

/**
 * Stripe adapter (international CARD) — docs/providers/STRIPE.md.
 * PaymentIntents API over plain HTTPS (no SDK dependency).
 *
 * Trust: SIGNED (Stripe-Signature, v1 = HMAC-SHA256 over `t + "." + raw_body`).
 * Ambiguous create: Stripe Idempotency-Key = ARO attempt idempotency key, so
 * recovery re-reads the same PaymentIntent instead of creating a second one.
 * Stripe amounts are already in the currency's minor unit.
 */

const BASE_URL = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_S = 300;

const PI_STATUS: Record<string, AttemptState> = {
  requires_payment_method: "PENDING",
  requires_confirmation: "PENDING",
  requires_action: "PENDING",
  processing: "PENDING",
  requires_capture: "PENDING",
  succeeded: "APPROVED",
  canceled: "CANCELED",
};

function piSnapshot(pi: Record<string, unknown>): ProviderPaymentSnapshot {
  const id = str(pi.id);
  if (!id) throw new ProviderError("AMBIGUOUS", "MALFORMED", "Stripe object without id");
  const status = str(pi.status) ?? "unknown";
  const snap: ProviderPaymentSnapshot = {
    providerPaymentId: id,
    providerStatus: status,
    state: PI_STATUS[status] ?? "PENDING",
  };
  if (typeof pi.amount === "number") snap.amountMinor = pi.amount;
  if (typeof pi.currency === "string") snap.currency = pi.currency.toUpperCase();
  const secret = str(pi.client_secret);
  if (secret) snap.instruction = { kind: "CARD", client_secret: secret };
  return snap;
}

export class StripeAdapter implements PaymentProviderAdapter {
  readonly key = "stripe" as const;
  readonly capabilities = {
    methods: ["CARD" as const],
    currencies: ["EUR", "USD", "BRL"],
    documentKinds: [],
    trust: "SIGNED" as const,
  };

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = BASE_URL,
  ) {}

  private auth(ctx: AdapterContext) {
    return `Bearer ${requireSecret(ctx.secrets, ctx.account.credentialRef, "secret_key")}`;
  }

  async createPayment(ctx: AdapterContext, input: CreatePaymentInput) {
    const form = new URLSearchParams({
      amount: String(input.amountMinor),
      currency: input.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      description: input.description,
      receipt_email: input.payer.email,
      "metadata[aro_attempt_id]": input.attemptId,
      "metadata[aro_order_id]": input.orderId,
    });
    const res = await requestJson(this.fetchImpl, `${this.baseUrl}/payment_intents`, {
      method: "POST",
      headers: {
        Authorization: this.auth(ctx),
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: form.toString(),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("MISCONFIGURED", `HTTP_${res.status}`, "Stripe rejected credentials");
    }
    if (res.status !== 200 || !isObj(res.body)) {
      const err = isObj(res.body) && isObj(res.body.error) ? str(res.body.error.code) : undefined;
      throw new ProviderError("REJECTED", err ?? `HTTP_${res.status}`, `Stripe create rejected (${res.status})`);
    }
    const snap = piSnapshot(res.body);
    if (!snap.instruction) throw new ProviderError("AMBIGUOUS", "MALFORMED", "Stripe returned no client_secret");
    return { ...snap, instruction: snap.instruction };
  }

  async getPayment(ctx: AdapterContext, ref: { providerPaymentId?: string; attemptId: string }) {
    const headers = { Authorization: this.auth(ctx) };
    if (ref.providerPaymentId) {
      const res = await requestJson(
        this.fetchImpl,
        `${this.baseUrl}/payment_intents/${encodeURIComponent(ref.providerPaymentId)}`,
        { method: "GET", headers },
      );
      if (res.status === 404) return null;
      if (res.status === 200 && isObj(res.body)) return piSnapshot(res.body);
      throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, "Stripe lookup failed");
    }
    const query = `metadata['aro_attempt_id']:'${ref.attemptId.replace(/'/g, "")}'`;
    const res = await requestJson(
      this.fetchImpl,
      `${this.baseUrl}/payment_intents/search?query=${encodeURIComponent(query)}`,
      { method: "GET", headers },
    );
    if (res.status === 200 && isObj(res.body) && Array.isArray(res.body.data)) {
      const first = res.body.data[0];
      return isObj(first) ? piSnapshot(first) : null;
    }
    throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, "Stripe search failed");
  }

  parseWebhook(ctx: AdapterContext, raw: RawWebhook): NormalizedWebhook {
    const secret = requireSecret(ctx.secrets, ctx.account.credentialRef, "webhook_secret");
    const parts = (header(raw.headers, "stripe-signature") ?? "").split(",").map((p) => p.trim());
    const t = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const v1s = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    const tNum = Number(t);
    if (!Number.isFinite(tNum) || Math.abs(Date.now() / 1000 - tNum) > SIGNATURE_TOLERANCE_S) {
      throw new WebhookRejectedError("timestamp outside tolerance");
    }
    const expected = hmacSha256Hex(secret, `${t}.${raw.rawBody}`);
    if (!v1s.some((s) => safeEqualHex(expected, s))) throw new WebhookRejectedError("invalid signature");

    let event: unknown;
    try {
      event = JSON.parse(raw.rawBody);
    } catch {
      throw new WebhookRejectedError("invalid JSON");
    }
    if (!isObj(event) || !isObj(event.data) || !isObj(event.data.object)) {
      throw new WebhookRejectedError("invalid event");
    }
    const type = str(event.type) ?? "unknown";
    const obj = event.data.object;
    const eventId = str(event.id) ?? `${str(obj.id)}:${type}`;
    const base = { eventId, eventType: type, trust: "SIGNED" as const, facts: { type } };

    if (type.startsWith("payment_intent.")) {
      const snap = piSnapshot(obj);
      delete snap.instruction;
      const meta = isObj(obj.metadata) ? obj.metadata : {};
      return { ...base, providerPaymentId: snap.providerPaymentId, attemptId: str(meta.aro_attempt_id), snapshot: snap };
    }
    if (type === "charge.refunded" && obj.refunded === true) {
      const pi = str(obj.payment_intent);
      if (pi) {
        return {
          ...base,
          providerPaymentId: pi,
          snapshot: { providerPaymentId: pi, providerStatus: "refunded", state: "REFUNDED" },
        };
      }
    }
    if (type === "charge.dispute.created") {
      const pi = str(obj.payment_intent);
      if (pi) {
        return {
          ...base,
          providerPaymentId: pi,
          snapshot: { providerPaymentId: pi, providerStatus: "disputed", state: "CHARGEBACK" },
        };
      }
    }
    return base;
  }
}
