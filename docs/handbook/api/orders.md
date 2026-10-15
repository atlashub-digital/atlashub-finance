# Orders

```http
GET /v1/orders/{order_id}
Authorization: Bearer aro_sk_…
```

Server-to-server only. Returns `404 NOT_FOUND` for unknown ids and for orders of other projects.

```json
{
  "id": "b2c9…",
  "project": "espelhomeu",
  "status": "APPROVED",
  "amount": { "amount_minor": 2090, "currency": "BRL" },
  "items": [
    { "offer": "p01-br", "product": "aro-espelhomeu-p01", "title": "EspelhoMeu P01", "quantity": 1,
      "unit_amount": { "amount_minor": 1190, "currency": "BRL" } },
    { "offer": "guia-br", "product": "aro-espelhomeu-guia", "title": "Guia", "quantity": 1,
      "unit_amount": { "amount_minor": 900, "currency": "BRL" } }
  ],
  "customer_id": "c41e…",
  "created_at": "2026-10-15T15:00:00.000Z",
  "approved_at": "2026-10-15T15:03:12.000Z"
}
```

| `status` | Meaning |
|---|---|
| `PENDING` | not paid yet (V1 does not report `CREATED` separately) |
| `APPROVED` | paid; entitlements granted |
| `CANCELED` | checkout failed/expired before payment |
| `REFUNDED` / `CHARGEBACK` | reversed; entitlements revoked |

`customer_id` is the canonical customer for [entitlement resolution](entitlements.md). Use orders for receipts and support; use entitlements for access.
