# MisticPay

Brazil PIX fallback. Reviewed against https://app.misticpay.com/docs (2026-10-15).

| Aspect | Behavior in ARO |
|---|---|
| API | `https://api.misticpay.com/api`, Access Key (`pk_…`/`sk_…`) via HTTP Basic. Legacy `ci`/`cs` credentials are not supported (shut down 2026-09-30). Scopes needed: `TRANSACTION_CREATE`, `TRANSACTION_READ` only |
| Create | `POST /transactions/create` with amount (decimal BRL), payer name, `payerDocument` (CPF), `transactionId` = ARO attempt id, `projectWebhook` = `<ARO>/v1/webhooks/providers/misticpay` |
| Payer document | CPF only (CNPJ not verified → CNPJ payers are not routed here) |
| Expiry | not documented by MisticPay; ARO shows 30 min as an informational expiry |
| Status | `PENDENTE → PENDING`, `COMPLETO → APPROVED`, `FALHA → FAILED`, `CANCELADO → CANCELED` |
| Trust | **VERIFIED_BY_FETCH**: webhooks are unsigned, so ARO ignores their content and re-reads `POST /transactions/check` before any state change |
| Units | create returns integer centavos; check returns decimal reais — both normalized to minor units at the edge |
| Caching | `check` may be cached for a few seconds while pending; a stale read keeps the webhook retryable and the reconciler re-checks |
| MED (PIX special return) | `INFRACTION` webhooks are recorded as provider risk events and **not** applied automatically |
| IP allowlist | supported by MisticPay; if enabled, include the ARO VPS egress IP |
| Sandbox | none |

## Secrets (ARO only)

`ARO_SECRET_ARO_ATLASHUB_MISTICPAY_PROD__CLIENT_ID`, `ARO_SECRET_ARO_ATLASHUB_MISTICPAY_PROD__CLIENT_SECRET`.

## Refunds — V1 limitation

MisticPay exposes no refund status that ARO can observe. A refund made at MisticPay is **not** reflected automatically in ARO. Follow [Manual Refund Operations](../operations/manual-refunds.md#misticpay).
