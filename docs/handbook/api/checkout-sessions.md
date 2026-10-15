# Checkout Sessions

A checkout session is one purchase attempt: ARO creates the order, chooses a provider and returns a payment instruction.

## Create

```http
POST /v1/checkout-sessions
X-ARO-Public-Key: aro_pk_…
Idempotency-Key: 6f1c…   (16–128 chars; a UUID per purchase attempt)
Content-Type: application/json
```

```json
{
  "project": "espelhomeu",
  "offer": "p01-br",
  "market": "BR",
  "country": "BR",
  "currency": "BRL",
  "payment_method": "PIX",
  "payer": { "name": "Cliente", "email": "cliente@example.com", "document": "52998224725" },
  "bump_offers": [],
  "attribution": { "utm_source": "instagram", "utm_campaign": "p01_launch" },
  "metadata": { "landing": "v2" }
}
```

Field rules (full schema: `CreateCheckoutSessionRequest` in the OpenAPI):

- `offer` and `bump_offers` must be active offers of this project, sold in `currency`, in `market` and with `payment_method`.
- `payer.document` (CPF/CNPJ, digits or formatted) is **required for PIX** — the QR code can only be paid by that document. It is validated (check digits), forwarded to the provider and never stored by ARO.
- The amount is never sent: ARO computes it from the offer(s).

### Response `201`

```json
{
  "id": "6a1f…",
  "order_id": "b2c9…",
  "project": "espelhomeu",
  "offer": "p01-br",
  "state": "PENDING",
  "amount": { "amount_minor": 1190, "currency": "BRL" },
  "checkout_secret": "aro_cs_…",
  "payment": {
    "kind": "PIX",
    "copy_paste": "000201…",
    "qr_payload": "000201…",
    "expires_at": "2026-10-15T15:20:00.000Z"
  },
  "expires_at": "2026-10-15T15:20:00.000Z",
  "created_at": "2026-10-15T15:00:00.000Z"
}
```

- PIX: render your own QR from `qr_payload` **unaltered** and show `copy_paste`.
- CARD: `payment` is `{ "kind": "CARD", "client_secret": "…" }` for the card element ARO's router selected (Stripe in V1).
- The response never names the provider.

### Idempotency

| Situation | Result |
|---|---|
| Same key, same body | `201` with the same session (header `idempotent-replayed: true`) |
| Same key, different body | `409 IDEMPOTENCY_CONFLICT` |
| Same key while the first request is still creating the payment | `409 IDEMPOTENCY_CONFLICT` — retry shortly |
| First request got `503 PROVIDER_UNAVAILABLE` | retry with the **same** key: ARO resumes safely without creating a second charge |

Use a new key only for a new purchase attempt (e.g. after `FAILED`/`EXPIRED`).

### Create errors

`400 INVALID_REQUEST` (schema), `401 UNAUTHORIZED`, `403 FORBIDDEN` (project/origin), `409 IDEMPOTENCY_CONFLICT`, `422 INVALID_OFFER | INVALID_PAYER | NO_PAYMENT_ROUTE | PROVIDER_REJECTED`, `429 RATE_LIMITED`, `503 PROVIDER_UNAVAILABLE`. See [Errors](errors.md).

## Read / poll

```http
GET /v1/checkout-sessions/{id}
X-ARO-Checkout-Secret: aro_cs_…
```

Returns the same representation with the current `state`. Poll every 3–5 s while `PENDING`; stop on any other state.

| `state` | Show the buyer |
|---|---|
| `PENDING` | QR / card form, waiting |
| `APPROVED` | success → open the product (after resolving the entitlement server-side) |
| `FAILED`, `CANCELED`, `EXPIRED` | not paid → offer a new attempt (new Idempotency-Key) |
| `REFUNDED`, `CHARGEBACK` | reversed; access removed |
| `CREATED` | transient; keep polling |

A late provider confirmation can still move `EXPIRED` → `APPROVED`: money received always wins.
