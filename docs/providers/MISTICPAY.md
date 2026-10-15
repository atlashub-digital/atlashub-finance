# Provider Adapter — MisticPay

## Role

Initial Brazil PIX provider candidate/fallback for ARO.

## Base API

`https://api.misticpay.com/api`

## Authentication

Use current Access Key credentials:
- client id `pk_...`
- client secret `sk_...`
- HTTP Basic Authorization

Required minimum scopes for cash-in integration:
- TRANSACTION_CREATE
- TRANSACTION_READ

Legacy `ci/cs` credentials were scheduled for shutdown on 30/09/2026 and must not be used in new ARO code.

## Cash-in

`POST /transactions/create`

Required:
- amount
- payerName
- payerDocument
- description

Optional/useful:
- transactionId → ARO external reference
- projectWebhook

Returned PIX data includes:
- transactionId
- QR image/base64/URL
- copyPaste
- transaction state
- fee fields

## Status

`POST /transactions/check`

States include:
- PENDENTE
- COMPLETO
- FALHA

Other listing surfaces document CANCELADO.

Normalization:
- PENDENTE → PENDING
- COMPLETO → APPROVED
- FALHA → FAILED
- CANCELADO → CANCELED

## Webhook

Deposit webhook contains:
- transactionId
- status
- value
- fee
- e2e
- bank identifiers

Public documentation does not establish a cryptographic webhook signature contract in the same way as PixGo.

Therefore ARO V1 trust policy for MisticPay should be:
**VERIFIED_BY_FETCH** — webhook signals a change, ARO checks `/transactions/check` before granting entitlement.

## Sandbox

Public docs state there is no sandbox. Controlled small production payments are required for final integration proof.

## Operational notes

API supports IP allowlisting. Production ARO should use stable egress where practical and restrict credentials/scopes.

## References

- https://app.misticpay.com/docs
