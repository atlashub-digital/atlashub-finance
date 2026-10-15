import { majorToMinor, minorToMajor } from "../../lib/money.js";
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
} from "../types.js";

/**
 * MisticPay adapter — docs/providers/MISTICPAY.md, https://app.misticpay.com/docs
 * (reviewed 2026-10-15).
 *
 * Trust: VERIFIED_BY_FETCH. Webhooks carry no signature, so they are only a
 * signal; state always comes from POST /transactions/check.
 * Auth: Access Key (pk_/sk_) via HTTP Basic. Legacy ci/cs is not supported.
 * Units: create returns minor-unit integers; check returns decimal reais.
 */

const BASE_URL = "https://api.misticpay.com/api";
/** Docs do not state PIX QR validity; ARO shows this as an informational expiry. */
const ASSUMED_QR_TTL_MS = 30 * 60 * 1000;

const STATUS: Record<string, AttemptState> = {
  PENDENTE: "PENDING",
  COMPLETO: "APPROVED",
  FALHA: "FAILED",
  CANCELADO: "CANCELED",
};

export class MisticPayAdapter implements PaymentProviderAdapter {
  readonly key = "misticpay" as const;
  readonly capabilities = {
    methods: ["PIX" as const],
    currencies: ["BRL"],
    // CNPJ cash-in not verified for MisticPay (docs/providers/MISTICPAY.md).
    documentKinds: ["CPF" as const],
    trust: "VERIFIED_BY_FETCH" as const,
  };

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = BASE_URL,
    private readonly now: () => number = Date.now,
  ) {}

  private headers(ctx: AdapterContext) {
    const id = requireSecret(ctx.secrets, ctx.account.credentialRef, "client_id");
    const secret = requireSecret(ctx.secrets, ctx.account.credentialRef, "client_secret");
    return {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createPayment(ctx: AdapterContext, input: CreatePaymentInput) {
    if (input.currency !== "BRL" || input.method !== "PIX") {
      throw new ProviderError("REJECTED", "UNSUPPORTED", "MisticPay supports BRL PIX only");
    }
    if (!input.payer.document) throw new ProviderError("REJECTED", "DOCUMENT_REQUIRED", "payerDocument required");
    const res = await requestJson(this.fetchImpl, `${this.baseUrl}/transactions/create`, {
      method: "POST",
      headers: this.headers(ctx),
      body: JSON.stringify({
        amount: minorToMajor(input.amountMinor),
        payerName: input.payer.name,
        payerDocument: input.payer.document,
        transactionId: input.attemptId,
        description: input.description,
        projectWebhook: input.webhookUrl,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("MISCONFIGURED", `HTTP_${res.status}`, "MisticPay rejected credentials/scope");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError("REJECTED", `HTTP_${res.status}`, `MisticPay create rejected (${res.status})`);
    }
    const data = isObj(res.body) && isObj(res.body.data) ? res.body.data : undefined;
    const id = data && str(data.transactionId);
    const copyPaste = data && str(data.copyPaste);
    if (!data || !id || !copyPaste) throw new ProviderError("AMBIGUOUS", "MALFORMED", "MisticPay create returned no PIX data");
    const expiresAt = new Date(this.now() + ASSUMED_QR_TTL_MS).toISOString();
    const providerStatus = str(data.transactionState) ?? "PENDENTE";
    const snap = {
      providerPaymentId: id,
      providerStatus,
      state: STATUS[providerStatus] ?? "PENDING",
      currency: "BRL",
      expiresAt,
      instruction: { kind: "PIX" as const, copy_paste: copyPaste, qr_payload: copyPaste, expires_at: expiresAt },
    } satisfies ProviderPaymentSnapshot;
    // Create response amounts are integer minor units.
    return {
      ...snap,
      ...(typeof data.transactionAmount === "number" ? { amountMinor: data.transactionAmount } : {}),
      ...(typeof data.transactionFee === "number" ? { feeMinor: data.transactionFee } : {}),
    };
  }

  async getPayment(ctx: AdapterContext, ref: { providerPaymentId?: string; attemptId: string }) {
    // /transactions/check takes the identifier we sent as transactionId.
    const res = await requestJson(this.fetchImpl, `${this.baseUrl}/transactions/check`, {
      method: "POST",
      headers: this.headers(ctx),
      body: JSON.stringify({ transactionId: ref.attemptId }),
    });
    if (res.status === 404) return null;
    const tx = isObj(res.body) && isObj(res.body.transaction) ? res.body.transaction : undefined;
    if (res.status !== 200 || !tx) throw new ProviderError("AMBIGUOUS", `HTTP_${res.status}`, "MisticPay check failed");
    const providerStatus = str(tx.transactionState) ?? "unknown";
    const snap: ProviderPaymentSnapshot = {
      providerPaymentId: ref.providerPaymentId ?? str(tx.transactionId) ?? ref.attemptId,
      providerStatus,
      state: STATUS[providerStatus] ?? "PENDING",
      currency: "BRL",
    };
    // Check amounts are decimal reais.
    if (typeof tx.value === "number" || typeof tx.value === "string") snap.amountMinor = majorToMinor(tx.value);
    if (typeof tx.fee === "number" || typeof tx.fee === "string") snap.feeMinor = majorToMinor(tx.fee);
    if (snap.amountMinor !== undefined && snap.feeMinor !== undefined) snap.netMinor = snap.amountMinor - snap.feeMinor;
    return snap;
  }

  parseWebhook(_ctx: AdapterContext, raw: RawWebhook): NormalizedWebhook {
    let payload: unknown;
    try {
      payload = JSON.parse(raw.rawBody);
    } catch {
      throw new WebhookRejectedError("invalid JSON");
    }
    if (!isObj(payload)) throw new WebhookRejectedError("invalid payload");
    if (payload.event === "INFRACTION") {
      // MED (PIX special return). Recorded for operators; never auto-applied in V1.
      const inf = isObj(payload.infraction) ? payload.infraction : {};
      const tx = isObj(payload.transaction) ? payload.transaction : {};
      return {
        eventId: `infraction:${str(inf.id) ?? "?"}:${str(inf.status) ?? "?"}`,
        eventType: "INFRACTION",
        trust: "UNTRUSTED",
        facts: { event: "INFRACTION", infraction_status: str(inf.status), transaction_ref: str(tx.transactionId) },
      };
    }
    const id = str(payload.transactionId);
    if (!id) throw new WebhookRejectedError("missing transactionId");
    const type = str(payload.transactionType) ?? "unknown";
    const status = str(payload.status) ?? "unknown";
    return {
      eventId: `${id}:${type}:${status}`,
      eventType: `${type}.${status}`,
      trust: "VERIFIED_BY_FETCH",
      providerPaymentId: id,
      facts: { transaction_type: type, status },
    };
  }
}
