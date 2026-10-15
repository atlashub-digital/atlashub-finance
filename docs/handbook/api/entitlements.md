# Entitlements

`POST /v1/entitlements/resolve` is the **authoritative access check**. Call it from the project server before serving protected content.

```http
POST /v1/entitlements/resolve
Authorization: Bearer aro_sk_…
Content-Type: application/json
```

By canonical customer (preferred once you have it, e.g. from an order or webhook):

```json
{ "project": "espelhomeu", "customer_id": "c41e…" }
```

Transitional V1 lookup by e-mail (case-insensitive):

```json
{ "project": "espelhomeu", "identity": { "email": "cliente@example.com" } }
```

Response:

```json
{
  "project": "espelhomeu",
  "customer_id": "c41e…",
  "entitlements": [
    { "key": "espelhomeu:p01", "status": "ACTIVE", "source_order_id": "b2c9…", "starts_at": "2026-10-15T15:03:12.000Z" }
  ]
}
```

## Semantics

- Only **active** rights are returned. Refunded/charged-back rights disappear from the list.
- Unknown customer or e-mail → `200` with `"entitlements": []` and no `customer_id`.
- `project` must match the server key's project (`403` otherwise).
- Customers are shared across AtlasHub projects in the same tenant, but entitlements are always filtered by project.

## Access rule

```
required key present in entitlements → allow
otherwise                             → deny / offer purchase or recovery
```

Never unlock from a browser redirect, a client-side flag or a webhook alone. Caching a positive answer for a few minutes is acceptable; re-resolve on refund webhooks.

Reference: [`examples/typescript/resolve-entitlements.ts`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/typescript/resolve-entitlements.ts).
