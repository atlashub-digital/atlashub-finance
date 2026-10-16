# Provider Routing

Projects never choose a provider. ARO resolves a route from `market + currency + payment_method`.

## V1 policy: PRIORITY_FAILOVER

| Market | Currency | Method | Route |
|---|---|---|---|
| BR | BRL | PIX | PixGo (priority 10) → MisticPay (priority 20) |
| any | EUR | CARD | Stripe (10) |
| any | USD | CARD | Stripe (10) |

Routes are tenant-wide defaults; a project-specific route set overrides them. Routing is configuration (`infra/projects/atlashub.providers.json`), not code. There is no AI or cost-based routing in V1.

## Eligibility

A route is skipped when its provider cannot take the payment:

| Provider | Methods | Currencies | Payer document | Minimum |
|---|---|---|---|---|
| PixGo | PIX | BRL | CPF or CNPJ (required) | R$ 10,00 |
| MisticPay | PIX | BRL | CPF only (required) | — |
| Stripe | CARD | EUR, USD, BRL | not used | — |

So a CNPJ payer is only routed to PixGo.

## Failover

- **Definitive rejection** (provider says no, or credentials misconfigured) → next route, same order.
- **Ambiguous outcome** (timeout, network error, 5xx) → ARO asks the provider whether the charge exists (by ARO reference) **before** doing anything else:
  - found → it is used; no second charge;
  - provably absent → next route;
  - provider cannot answer → `503 PROVIDER_UNAVAILABLE`, **no failover** (a second live PIX could be paid twice). The client retries with the same Idempotency-Key.
- If both providers ever confirm payment for the same order, ARO grants access once and flags the duplicate (`DUPLICATE_PAYMENT`) for an operator refund.

## Disabling a provider

ARO operations set the provider account to `disabled` (or `degraded`) and re-apply the providers file; new checkouts skip it immediately. Existing payable QR codes keep working.
