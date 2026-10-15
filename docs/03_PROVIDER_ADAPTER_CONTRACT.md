# Provider Adapter Contract

## Goal

Every PSP/payment rail implements one Atlas contract.

Projects never call PixGo, MisticPay or Stripe directly.

## Required interface

Conceptual interface:

```ts
interface PaymentProviderAdapter {
  key: string;
  capabilities(): ProviderCapabilities;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPayment(ref: ProviderPaymentRef): Promise<NormalizedPayment>;
  normalizeWebhook(input: RawWebhook): Promise<NormalizedProviderEvent>;
  verifyWebhook?(input: RawWebhook): Promise<boolean>;
  refund?(input: RefundInput): Promise<RefundResult>;
  health?(): Promise<ProviderHealth>;
}
```

## CreatePaymentInput

Provider-neutral:
- projectId
- checkoutSessionId
- orderId
- amountMinor
- currency
- method
- payer identity required by selected rail
- description
- callback/webhook URL
- idempotency key
- metadata allowlist

## CreatePaymentResult

- provider
- providerPaymentId
- state
- expiresAt
- qrCodeText (PIX when applicable)
- qrCodeImage / image URL where safe
- redirectUrl where applicable
- rawReferenceHash
- provider fee when known

## Webhook normalization

Provider payloads become stable ARO events:

- PAYMENT_PENDING
- PAYMENT_APPROVED
- PAYMENT_FAILED
- PAYMENT_EXPIRED
- PAYMENT_REFUNDED
- PAYMENT_CHARGEBACK
- PROVIDER_RISK_EVENT

## Webhook trust policy

Three levels:

### SIGNED
Cryptographic signature verified.

### VERIFIED_BY_FETCH
Webhook is only a signal; ARO performs provider status lookup before granting access.

### UNTRUSTED
Never changes monetary state automatically.

Provider adapter docs must declare their level.

## Idempotency

ARO idempotency key:
`project_id + order_id + attempt_number`

Provider events use:
`provider + provider_event_id`
or a deterministic event fingerprint where the provider has no event ID.

## Failure isolation

Provider outage must not corrupt order state.

Expected behavior:
- create attempt;
- persist provider error code;
- keep order retryable;
- optionally route a new attempt to fallback provider;
- never create duplicate approved entitlements.
