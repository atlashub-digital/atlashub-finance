# Webhooks

ARO sends **signed, at-least-once** notifications to the project's webhook URL (configured by ARO operations). They speed up UX; they are **not** the access authority — always resolve entitlements before granting access.

## Request

```http
POST https://espelho.lia.doctor/api/aro/webhook
Content-Type: application/json
X-ARO-Event-Id: 2b7d…
X-ARO-Timestamp: 1792040470
X-ARO-Signature: v1=5f2c…
```

```json
{
  "id": "2b7d…",
  "type": "entitlement.granted",
  "created_at": "2026-10-15T15:03:12.000Z",
  "project": "espelhomeu",
  "data": { "order_id": "b2c9…", "customer_id": "c41e…", "entitlements": ["espelhomeu:p01"] }
}
```

## Verify

1. Read the **raw** body before JSON parsing.
2. Reject if `|now − X-ARO-Timestamp| > 300 s`.
3. Compute `HMAC-SHA256(ARO_WEBHOOK_SECRET, timestamp + "." + raw_body)` as hex.
4. Compare with the `v1=` value in constant time.
5. Deduplicate by `X-ARO-Event-Id` (= body `id`).
6. Respond `2xx` quickly; do heavy work asynchronously.

Reference implementation: [`examples/typescript/verify-aro-webhook.ts`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/typescript/verify-aro-webhook.ts).

## Event types

| `type` | When | `data` |
|---|---|---|
| `checkout.started` | session created | `checkout_session_id`, `order_id`, `customer_id`, `offer`, `bump_offers`, `amount`, `attribution` |
| `payment.pending` | payment instruction issued | `checkout_session_id`, `order_id`, `customer_id`, `payment` |
| `payment.approved` | provider confirmed | same as above |
| `payment.failed` | attempt failed, canceled or expired (`payment.state` says which) | same as above |
| `payment.refunded` | provider refund confirmed | same as above |
| `payment.chargeback` | dispute opened | same as above |
| `order.approved` | order paid | `checkout_session_id`, `order_id`, `customer_id`, `amount` |
| `entitlement.granted` | rights activated | `order_id`, `customer_id`, `entitlements[]` |
| `entitlement.revoked` | rights removed after refund/chargeback | `order_id`, `customer_id`, `entitlements[]`, `reason` |

`payment` = `{ "id", "state", "method", "amount": { "amount_minor", "currency" } }`. The provider is never included. The list of types is the `ProjectEvent.type` enum in the OpenAPI; new optional `data` fields may be added — ignore unknown fields.

## Delivery semantics

- Each event is emitted once per business fact (duplicate provider events do not create duplicate events), but **delivered at least once** — your handler must be idempotent.
- Order across events is not guaranteed; use `entitlements/resolve` for the current truth.
- Non-2xx or timeout (10 s) → retry with exponential backoff: 30 s, 1 min, 2 min, … capped at 6 h; after 12 attempts (~1.5 days) the delivery is dead-lettered. Redirects are not followed.
- ARO operations can replay any event (`admin-cli replay-event <event-id>`).
