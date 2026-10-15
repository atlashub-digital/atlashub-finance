import type { SecretResolver } from "../security/secrets.js";

/**
 * Provider adapter contract (docs/03_PROVIDER_ADAPTER_CONTRACT.md).
 * Everything provider-specific stays behind this interface; the commerce core
 * only sees normalized states, minor-unit money and payment instructions.
 */

export type ProviderKey = "pixgo" | "misticpay" | "stripe";
export type PaymentMethod = "PIX" | "CARD";
export type TrustLevel = "SIGNED" | "VERIFIED_BY_FETCH" | "UNTRUSTED";

/** Normalized attempt/payment states. UNKNOWN = create outcome ambiguous. */
export type AttemptState =
  | "CREATED"
  | "UNKNOWN"
  | "PENDING"
  | "APPROVED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "CHARGEBACK";

export type PaymentInstruction =
  | { kind: "PIX"; copy_paste: string; qr_payload: string; expires_at: string }
  | { kind: "CARD"; client_secret?: string; redirect_url?: string };

export type ProviderCapabilities = {
  methods: PaymentMethod[];
  currencies: string[];
  /** Payer document kinds accepted; empty = no document needed. */
  documentKinds: ("CPF" | "CNPJ")[];
  minAmountMinor?: number;
  trust: TrustLevel;
};

export type ProviderAccount = {
  id: string;
  provider: ProviderKey;
  credentialRef: string;
};

export type AdapterContext = {
  account: ProviderAccount;
  secrets: SecretResolver;
};

export type CreatePaymentInput = {
  /** ARO attempt id; sent to the provider as external reference. */
  attemptId: string;
  /** project + order + attempt_number. */
  idempotencyKey: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  payer: { name: string; email: string; document?: string; phone?: string };
  description: string;
  webhookUrl: string;
};

export type ProviderPaymentSnapshot = {
  providerPaymentId: string;
  state: AttemptState;
  providerStatus: string;
  amountMinor?: number;
  currency?: string;
  feeMinor?: number;
  netMinor?: number;
  /** Present when the provider can re-issue the instruction (ambiguous-create recovery). */
  instruction?: PaymentInstruction;
  expiresAt?: string;
};

export type NormalizedWebhook = {
  /** Provider event identity, or a deterministic fingerprint. */
  eventId: string;
  eventType: string;
  trust: TrustLevel;
  providerPaymentId?: string;
  /** ARO attempt id when the provider echoes our external reference. */
  attemptId?: string;
  /** Only meaningful when trust = SIGNED. */
  snapshot?: ProviderPaymentSnapshot;
  /** Non-PII facts kept in the inbox for audit. */
  facts: Record<string, unknown>;
};

export type RawWebhook = { headers: Record<string, string | string[] | undefined>; rawBody: string };

export interface PaymentProviderAdapter {
  readonly key: ProviderKey;
  readonly capabilities: ProviderCapabilities;
  /** Throws ProviderError. */
  createPayment(ctx: AdapterContext, input: CreatePaymentInput): Promise<ProviderPaymentSnapshot & { instruction: PaymentInstruction }>;
  /**
   * Fetches provider truth. Lookup by providerPaymentId, or by our attempt id
   * when the create outcome was ambiguous. Returns null when the provider
   * definitively has no such payment. Throws ProviderError(AMBIGUOUS) if unsure.
   */
  getPayment(ctx: AdapterContext, ref: { providerPaymentId?: string; attemptId: string }): Promise<ProviderPaymentSnapshot | null>;
  /** Verifies (when SIGNED) and normalizes. Throws WebhookRejectedError. */
  parseWebhook(ctx: AdapterContext, raw: RawWebhook): NormalizedWebhook;
}

export type ProviderErrorKind = "REJECTED" | "AMBIGUOUS" | "MISCONFIGURED";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class WebhookRejectedError extends Error {}

export const header = (h: RawWebhook["headers"], name: string): string | undefined => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};
