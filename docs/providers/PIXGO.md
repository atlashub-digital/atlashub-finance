# Provider Adapter — PixGo

## Role

Initial Brazil PIX provider candidate for ARO.

## Current public API facts

Base URL:
`https://pixgo.org/api/v1`

Authentication:
`X-API-Key`

Cash-in creation:
`POST /payment/create`

Status:
`GET /payment/{id}/status`

Payment details:
`GET /payment/{id}`

Search by external reference:
`GET /payments`

## Required payer document

As of 25/06/2026, `receiver_cpf` (CPF/CNPJ) is mandatory and the generated QR is restricted to that document.

ARO checkout must therefore collect/validate the document before routing to PixGo.

## Amount

Public docs state a minimum of R$10,00 for creation.

All current EspelhoMeu launch offers are above that floor.

## Webhook

Events include:
- order.created
- payment.completed
- payment.expired
- payment.refunded

Headers:
- X-Webhook-Event
- X-Webhook-Timestamp
- X-Webhook-Signature

Verification:
HMAC-SHA256 over:
`timestamp + "." + raw_body`

Webhook trust level:
**SIGNED**, with optional provider status fetch before entitlement for critical flows.

## Normalization

Suggested:
- pending → PENDING
- completed → APPROVED
- expired → CANCELED/EXPIRED
- refunded → REFUNDED

## Idempotency

Use provider payment_id + event or provider event identity where available.

External order correlation uses ARO order/checkout reference in `external_id`.

## Environment

Public docs indicate no sandbox; test with controlled low-value production payment.

## References

- https://pixgo.org/api/v1/docs
- https://pixgo.org/api-pix
