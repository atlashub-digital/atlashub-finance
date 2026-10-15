# ARO Project Integration Contract V1

## Audience

CODEX, Claude Code, internal engineering agents and human developers integrating:

- EspelhoMeu;
- LeveLab;
- Atlas Club;
- MyPets;
- AtlasHub Editions;
- future AtlasHub/AMF projects.

## Golden rule

**Projects integrate with ARO, not payment providers.**

No project repository should contain production:
- PixGo API credentials;
- MisticPay credentials;
- Stripe secret keys;
- provider webhook logic;
- provider-specific payment state machines.

## Project responsibilities

Project owns:
- landing/sales page;
- branded checkout UI;
- offer selection UX;
- customer-facing status;
- product fulfillment UX;
- protected Reader/Library/member experience.

ARO owns:
- commercial offer authority;
- routing;
- provider integration;
- checkout session;
- order/payment state;
- provider webhooks;
- normalized revenue events;
- entitlement state.

## Required project configuration

```yaml
project:
  slug: espelhomeu
  allowed_origins:
    - https://espelho.lia.doctor
  webhook_url: https://espelho.lia.doctor/api/aro/webhook
  default_market: BR
  default_currency: BRL
```

Project receives:
- public checkout key;
- server key;
- outbound webhook secret.

## Browser integration

### Create checkout

Browser may call ARO directly using the project public key only if:
- origin is allowlisted;
- operation is public-checkout scoped;
- rate limits apply;
- no privileged data is returned.

Preferred implementation may proxy through the project web backend.

Request:

```http
POST /v1/checkout-sessions
X-ARO-Public-Key: aro_pk_...
Idempotency-Key: <uuid>
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
  "payer": {
    "name": "Cliente",
    "email": "cliente@example.com",
    "document": "..."
  },
  "attribution": {
    "utm_source": "instagram",
    "utm_campaign": "p01_launch"
  }
}
```

Response:

```json
{
  "id": "checkout-uuid",
  "order_id": "order-uuid",
  "project": "espelhomeu",
  "offer": "p01-br",
  "state": "PENDING",
  "amount": {
    "amount_minor": 1190,
    "currency": "BRL"
  },
  "checkout_secret": "opaque-ephemeral-secret",
  "payment": {
    "kind": "PIX",
    "copy_paste": "000201...",
    "qr_payload": "000201...",
    "expires_at": "2026-10-15T06:00:00Z"
  }
}
```

The project may render its own clean QR from `qr_payload`.

Do not alter the payload.

## Status polling

```http
GET /v1/checkout-sessions/{id}
X-ARO-Checkout-Secret: <checkout_secret>
```

Project renders normalized states:
- CREATED
- PENDING
- APPROVED
- FAILED
- CANCELED
- EXPIRED
- REFUNDED
- CHARGEBACK

Do not expose provider states.

## Server-side entitlement check

Before granting protected content:

```http
POST /v1/entitlements/resolve
Authorization: Bearer <ARO_PROJECT_SERVER_KEY>
Content-Type: application/json
```

By canonical customer:

```json
{
  "project": "espelhomeu",
  "customer_id": "customer-uuid"
}
```

Transitional V1 identity resolution:

```json
{
  "project": "espelhomeu",
  "identity": {
    "email": "cliente@example.com"
  }
}
```

Example response:

```json
{
  "project": "espelhomeu",
  "customer_id": "customer-uuid",
  "entitlements": [
    {
      "key": "espelhomeu:p01",
      "status": "ACTIVE",
      "source_order_id": "order-uuid",
      "starts_at": "2026-10-15T05:01:22Z"
    }
  ]
}
```

Project access rule:

```
ACTIVE entitlement
→ unlock product
otherwise
→ deny / offer recovery
```

## ARO outbound webhooks to projects

Projects may configure one webhook endpoint.

Example:

```http
POST https://espelho.lia.doctor/api/aro/webhook
X-ARO-Event-Id: <uuid>
X-ARO-Timestamp: 1792040470
X-ARO-Signature: v1=<hex>
```

Body:

```json
{
  "id": "event-uuid",
  "type": "entitlement.granted",
  "created_at": "2026-10-15T05:01:22Z",
  "project": "espelhomeu",
  "data": {
    "customer_id": "customer-uuid",
    "order_id": "order-uuid",
    "entitlements": ["espelhomeu:p01"]
  }
}
```

## Signature verification

Signature input:

```
timestamp + "." + raw_request_body
```

Algorithm:

```
HMAC-SHA256(project_webhook_secret, signature_input)
```

Project must:
1. read raw request body;
2. verify timestamp tolerance;
3. compute HMAC;
4. compare constant-time;
5. deduplicate X-ARO-Event-Id;
6. return 2xx quickly;
7. process asynchronously where possible.

## Delivery semantics

ARO outbound webhook delivery is **at least once**.

Therefore project consumers MUST be idempotent.

Recommended dedupe key:

```
ARO event id
```

Retry policy implementation is owned by ARO.

## Important authority rule

An outbound webhook is a notification.

For protected product access, the project should be able to re-resolve entitlement from ARO.

This prevents:
- missed webhook;
- duplicate webhook;
- delayed webhook;
- local cache drift;

from becoming financial truth.

## Events V1

- checkout.started
- payment.pending
- payment.approved
- payment.failed
- payment.refunded
- payment.chargeback
- order.approved
- entitlement.granted
- entitlement.revoked

## Multi-currency

Every request/response uses:

```json
{
  "amount_minor": 2900,
  "currency": "EUR"
}
```

Never use floating-point currency values.

A project may sell the same product through separate offers:

```
p01-br  → 1190 BRL
p01-eu  →  500 EUR
p01-us  →  600 USD
```

Offer and routing are separate:
- offer decides commercial price/currency;
- ARO routing decides provider.

## Project ENV

A project should require only:

```
ARO_API_URL=
ARO_PROJECT_SLUG=
ARO_PUBLIC_KEY=
ARO_SERVER_KEY=
ARO_WEBHOOK_SECRET=
```

No provider secrets.

## Integration acceptance

A project is ready when:

1. create checkout works;
2. QR/payment instruction renders;
3. PENDING is visible;
4. controlled payment becomes APPROVED;
5. project webhook verifies successfully;
6. entitlement resolves ACTIVE;
7. protected product unlocks;
8. duplicate webhook is harmless;
9. refund/revoke removes access according to policy;
10. provider name can change without project code change.
