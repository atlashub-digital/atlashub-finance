# Errors

All errors share one shape:

```json
{ "error": "INVALID_OFFER", "message": "Offer p01-br is not sold in USD", "request_id": "1c9e…" }
```

`error` is a stable code from the OpenAPI `Error.error` enum; `message` is human-readable and may change.

| Code | HTTP | Meaning | What to do |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | Body/header fails the schema (e.g. short `Idempotency-Key`), bad webhook signature | Fix the request |
| `UNAUTHORIZED` | 401 | Missing/invalid key, wrong key type, wrong checkout secret | Check the credential and header |
| `FORBIDDEN` | 403 | Key not valid for this `project`, origin not allowlisted, operator scope missing | Use the right key/origin |
| `NOT_FOUND` | 404 | Unknown resource or another project's resource | — |
| `IDEMPOTENCY_CONFLICT` | 409 | Key reused with a different body, or the same request still in progress | New key for a new body; otherwise retry later |
| `INVALID_OFFER` | 422 | Unknown/inactive offer; wrong currency, market or payment method; recurring offer | Use a registered offer code |
| `INVALID_PAYER` | 422 | Payer document missing/invalid, or document type not accepted by any route | Ask for a valid CPF/CNPJ |
| `NO_PAYMENT_ROUTE` | 422 | No active route for market/currency/method | Contact ARO operations |
| `PROVIDER_REJECTED` | 422 | Every eligible provider refused the charge | New attempt later; contact ARO operations if repeated |
| `PROVIDER_UNAVAILABLE` | 503 | Provider could not confirm whether the charge exists | Retry with the **same** Idempotency-Key |
| `RATE_LIMITED` | 429 | Too many checkout requests | Back off |
| `INTERNAL_ERROR` | 500 | Unexpected | Retry; report `request_id` |

Reserved in the contract, not emitted by V1: `PAYMENT_PENDING`, `PAYMENT_FAILED`, `CHECKOUT_EXPIRED`, `ENTITLEMENT_NOT_READY` (states are reported in resources, not as errors).
