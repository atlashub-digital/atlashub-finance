# Troubleshooting

Always capture the `x-request-id` response header.

| Symptom | Likely cause | Action |
|---|---|---|
| `401` on checkout create | wrong/missing `X-ARO-Public-Key`, or server key used | use the project public key |
| `403` on checkout create | `project` ≠ key's project, or `Origin` not allowlisted | fix `project`; ask ARO operations to add the origin |
| `401` on order/resolve | public key used instead of `Authorization: Bearer <server key>` | use the server key, server-side |
| `422 INVALID_PAYER` | no CPF/CNPJ for PIX, invalid check digits, or CNPJ when only CPF routes are available | collect a valid document |
| `422 INVALID_OFFER` | unknown/inactive offer, currency/market/method not allowed, or recurring offer | check the offer code in the catalog |
| `409 IDEMPOTENCY_CONFLICT` | same key, different body — or first request still running | new key for a new attempt; otherwise retry |
| `503 PROVIDER_UNAVAILABLE` | provider could not confirm the charge | retry with the **same** key after a few seconds |
| Stuck in `PENDING` after paying | webhook delayed/lost | ARO re-checks pending payments every minute after 2 min; keep polling. Escalate after 10 min with the session id |
| Paid but order not approved, attempt shows `AMOUNT_MISMATCH` | provider amount ≠ offer amount | operator investigation; refund if needed |
| PIX "payer not allowed" at the bank | QR locked to the document given at checkout (PixGo) | the buyer must pay with that CPF/CNPJ |
| Webhook signature fails | parsed body re-serialized; wrong secret; clock skew | verify the raw body; check `ARO_WEBHOOK_SECRET`; sync the clock |
| Same event processed twice | at-least-once delivery | dedupe on `X-ARO-Event-Id` |
| Access still granted after refund | project cached access | re-resolve on `entitlement.revoked`; keep cache short |
| `entitlements: []` for a buyer | different e-mail used at checkout, or payment not approved | resolve by `customer_id` from the order/webhook |

## For ARO operations

- `GET /health` → `db: down` means the API is up but the database is unreachable.
- Webhook deliveries: `aro_webhook_delivery` (`status`, `attempts`, `lastStatusCode`, `lastError`); replay with `admin-cli replay-event <event-id>`.
- Provider inbox: `billing_webhook_event` (`status` `processed` / `ignored` / `failed`, `error`).
- Attempt exceptions: `aro_payment_attempt."errorCode"` (`AMOUNT_MISMATCH`, `DUPLICATE_PAYMENT`, `REJECTED:*`, `NOT_CREATED`); `UNKNOWN` state older than a few minutes means an unresolved ambiguous create.
- Internal runbook: `docs/40_ARO_RUNTIME_RUNBOOK.md` in the repository.
