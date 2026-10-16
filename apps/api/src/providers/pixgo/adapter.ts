import { hmacSha256Hex, safeEqualHex } from "../../lib/crypto.js";
import { majorToMinor, minorToMajor } from "../../lib/money.js";
import { requireSecret } from "../../security/secrets.js";
import { type FetchLike, isObj, requestJson, str } from "../http.js";
import {
  type AdapterContext,
  type AttemptState,
  type CreatePaymentInput,
  type NormalizedWebhook,
  type PaymentInstruction,
  type PaymentProviderAdapter,
  ProviderError,
  type ProviderPaymentSnapshot,
  type RawWebhook,
  WebhookRejectedError,
  header,
} from "../types.js";

/**
 * PixGo adapter — docs/providers/PIXGO.md, https://pixgo.org/api/v1/docs
 * (reviewed 2026-10-15, page last updated 2026-10-11).
 *
 * Trust: SIGNED (HMAC-SHA256 over `timestamp + "." + raw_body`).
 * Amounts are decimal BRL at this edge; converted to minor units here.
 */

const BASE_URL = "https://pixgo.org/api/v1";
const SIGNATURE_TOLERANCE_S = 300;

const STATUS: Record<string, AttemptState> = {
  pending: "PENDING",
  completed: "APPROVED",
  expired: "EXPIRED",
  cancelled: "CANCELED",
  canceled: "CANCELED",
  refunded: "REFUNDED",
};

const EVENT_STATUS: Record<string, string> = {
  "payment.completed": "completed",
  "payment.expired": "expired",
  "payment.refunded": "refunded",
};

/** PixGo returns naive local timestamps (America/Sao_Paulo, UTC-3, no DST since 2019). */
export function pixgoTime(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}-03:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function snapshotFrom(data: Record<string, unknown>): ProviderPaymentSnapshot {
  const providerStatus = str(data.status) ?? "unknown";
  const id = str(data.payment_id);
  if (!id) throw new ProviderError("AMBIGUOUS", "MALFORMED", "PixGo response without payment_id");
  const amounts = isObj(data.amounts) ? data.amounts : undefined;
  const qr = str(data.qr_code);
  const expiresAt = pixgoTime(str(data.expires_at));
  const snap: ProviderPaymentSnapshot = {
    providerPaymentId: id,
    providerStatus,
    state: STATUS[providerStatus] ?? "PENDING",
    currency: "BRL",
  };
  const gross = amounts?.gross ?? data.amount;
  if (typeof gross === "number" || typeof gross === "string") snap.amountMinor = majorToMinor(gross);
  if (amounts && (typeof amounts.fee_total === "number" || typeof amounts.fee_total === "string")) {
    snap.feeMinor = majorToMinor(amounts.fee_total);
  }
  if (amounts && (typeof amounts.net === "number" || typeof amounts.net === "string")) {
    snap.netMinor = majorToMinor(amounts.net);
  }
  if (expiresAt) snap.expiresAt = expiresAt;
  if (qr && expiresAt) snap.instruction = { kind: "PIX", copy_paste: qr, qr_payload: qr, expires_at: expiresAt };
  return snap;
}

export class PixGoAdapter implements PaymentProviderAdapter {
  readonly key = "pixgo" as const;
  readonly capabilities = {
    methods: ["PIX" as const],
    currencies: ["BRL"],
    documentKinds: ["CPF" as const, "CNPJ" as const],
    minAmountMinor: 1000,
    trust: "SIGNED" as const,
  };

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = BASE_URL,
  ) {}

  private headers(ctx: AdapterContext) {
    return {
      "X-API-Key": requireSecret(ctx.secrets, ctx.account.credentialRef, "api_key"),
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createPayment(ctx: AdapterContext, input: CreatePaymentInput) {
    if (input.currency !== "BRL" || input.method !== "PIX") {
      throw new ProviderError("REJECTED", "UNSUPPORTED", "PixGo supports BRL PIX only");
    }
    if (!input.payer.document) throw new ProviderError("REJECTED", "DOCUMENT_REQUIRED", "receiver_cpf required");
    const body = {
      amount: minorToMajor(input.amountMinor),
      description: input.description.slice(0, 200),
      receiver_name: input.payer.name.slice(0, 100),
      receiver_cpf: input.payer.document,
      receiver_email: input.payer.email,
      external_id: input.attemptId,
      webhook_url: input.webhookUrl,
    };
    const res = await requestJson(this.fetchImpl, `${this.baseUrl}/payment/create`, {
      method: "POST",
      headers: this.headers(ctx),
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("MISCONFIGURED", `HTTP_${res.status}`, "PixGo rejected credentials");
    }
    if (res.status !== 200 && res.status !== 201) {
      const code = isObj(res.body) ? (str(res.body.error) ?? `HTTP_${res.status}`) : `HTTP_${res.status}`;
      throw new ProviderError("REJECTED", code, `PixGo create rejected (${res.status})`);
    }
    if (!isObj(res.body) || !isObj(res.body.data)) {
      throw new ProviderError("AMBIGUOUS", "MALFORMED", "PixGo create returned no data");
    }
    const snap = snapshotFrom(res.body.data);
    if (!snap.instruction) throw new ProviderError("AMBIGUOUS", "MALFORMED", "PixGo create returned no QR");
    return { ...snap, instruction: snap.instruction as PaymentInstruction };
  }

  async getPayment(ctx: AdapterContext, ref: { providerPaymentId?: string; attemptId: string }) {
    if (ref.providerPaymentId) {
      const res = await requestJson(
        this.fetchImpl,
        `${this.baseUrl}/payment/${encodeURIComponent(ref.providerPaymentId)}`,
        { method: "GET", headers: this.headers(ctx) },
      );
      if (res.status === 404) return null;
      // 410 Gone = terminal state, body identical to 200.
      if ((res.status === 200 || res.status === 410) && isObj(res.body) && isObj(res.body.data)) {
        return snapshotFrom(res.body.data);
      }
      throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, "PixGo lookup failed");
    }
    const res = await requestJson(
      this.fetchImpl,
      `${this.baseUrl}/payments?external_id=${encodeURIComponent(ref.attemptId)}`,
      { method: "GET", headers: this.headers(ctx) },
    );
    if (res.status === 200 && isObj(res.body) && Array.isArray(res.body.data)) {
      const first = res.body.data.find((p) => isObj(p) && p.external_id === ref.attemptId);
      return isObj(first) ? snapshotFrom(first) : null;
    }
    throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, "PixGo search failed");
  }

  parseWebhook(ctx: AdapterContext, raw: RawWebhook): NormalizedWebhook {
    const secret = requireSecret(ctx.secrets, ctx.account.credentialRef, "webhook_secret");
    const ts = header(raw.headers, "x-webhook-timestamp") ?? "";
    const sig = (header(raw.headers, "x-webhook-signature") ?? "").trim().toLowerCase();
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SIGNATURE_TOLERANCE_S) {
      throw new WebhookRejectedError("timestamp outside tolerance");
    }
    if (!safeEqualHex(hmacSha256Hex(secret, `${ts}.${raw.rawBody}`), sig)) {
      throw new WebhookRejectedError("invalid signature");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.rawBody);
    } catch {
      throw new WebhookRejectedError("invalid JSON");
    }
    if (!isObj(payload) || !isObj(payload.data)) throw new WebhookRejectedError("missing data");
    const event = str(payload.event) ?? header(raw.headers, "x-webhook-event") ?? "unknown";
    const data = { ...payload.data };
    if (!data.status && EVENT_STATUS[event]) data.status = EVENT_STATUS[event];
    const snapshot = snapshotFrom(data);
    delete snapshot.instruction;
    return {
      eventId: `${snapshot.providerPaymentId}:${event}`,
      eventType: event,
      trust: "SIGNED",
      providerPaymentId: snapshot.providerPaymentId,
      attemptId: str(data.external_id),
      snapshot,
      // Allowlisted, PII-free facts only (customer/payer objects are dropped).
      facts: {
        event,
        status: snapshot.providerStatus,
        amount_minor: snapshot.amountMinor,
        fee_minor: snapshot.feeMinor,
        net_minor: snapshot.netMinor,
      },
    };
  }
}
