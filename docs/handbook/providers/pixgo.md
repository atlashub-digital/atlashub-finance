# PixGo

Primary Brazil PIX provider. Reviewed against the public API docs (https://pixgo.org/api/v1/docs, page updated 2026-10-11).

| Aspect | Behavior in ARO |
|---|---|
| API | `https://pixgo.org/api/v1`, header `X-API-Key` |
| Create | `POST /payment/create` with amount (decimal BRL), `receiver_cpf`, name, e-mail, `external_id` = ARO attempt id, `webhook_url` = `<ARO>/v1/webhooks/providers/pixgo` |
| Payer document | **Mandatory** CPF/CNPJ; the QR can only be paid by that document (third-party payments are rejected and refunded by PixGo) |
| Minimum | R$ 10,00 per charge |
| Expiry | per charge, from `expires_at` (naive São Paulo time, normalized to UTC) |
| Status | `pending → PENDING`, `completed → APPROVED`, `expired → EXPIRED`, `cancelled → CANCELED`, `refunded → REFUNDED` |
| Webhooks | `payment.completed`, `payment.expired`, `payment.refunded` |
| Trust | **SIGNED**: HMAC-SHA256 over `timestamp + "." + raw_body` (`X-Webhook-Signature`, `X-Webhook-Timestamp`, 300 s tolerance) |
| Amount check | approval is applied only if the paid gross equals the attempt amount |
| Fees | `amounts.fee_total` / `amounts.net` captured in minor units |
| Ambiguous create | recovered with `GET /payments?external_id=<attempt id>` |
| Lookups | `GET /payment/{id}` (`410` = terminal, treated as valid) — used by the reconciler |
| Sandbox | none — test with small real payments |

## Secrets (ARO only)

`ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__API_KEY`, `ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__WEBHOOK_SECRET`.

## Refunds

Done in the PixGo dashboard; the `payment.refunded` webhook reverses the order in ARO. See [Manual Refund Operations](../operations/manual-refunds.md).
