# ARO API Contracts V1

## Principle

Project code communicates with ARO APIs, not provider APIs or ARO tables.

## Create checkout

`POST /v1/checkout-sessions`

Request:
```json
{
  "project": "espelhomeu",
  "offer": "p01",
  "market": "BR",
  "country": "BR",
  "currency": "BRL",
  "payment_method": "PIX",
  "payer": {
    "name": "Customer",
    "email": "customer@example.com",
    "document": "..."
  },
  "bump_offers": [],
  "attribution": {
    "utm_source": "instagram",
    "utm_campaign": "p01_launch"
  }
}
```

Response:
```json
{
  "checkout_session_id": "...",
  "order_id": "...",
  "provider": "pixgo",
  "payment_attempt_id": "...",
  "state": "PENDING",
  "payment": {
    "kind": "PIX",
    "qr_code_text": "...",
    "qr_image": "...",
    "expires_at": "..."
  }
}
```

## Checkout status

`GET /v1/checkout-sessions/{id}`

Returns normalized ARO state only.

## Entitlements

`GET /v1/projects/{project}/customers/{customer}/entitlements`

or a token/session scoped endpoint for project frontends.

## Provider webhooks

Provider-specific ingress:
- `/v1/webhooks/pixgo`
- `/v1/webhooks/misticpay`
- `/v1/webhooks/stripe`

Provider payloads never leak into project contracts.

## Refund

`POST /v1/orders/{order}/refunds`

Sensitive action. Requires operator/policy authorization.

## Routing inspection

`GET /v1/projects/{project}/payment-routes`

Operator only.

## Error model

Stable ARO error codes:
- INVALID_OFFER
- INVALID_PAYER
- NO_PAYMENT_ROUTE
- PROVIDER_UNAVAILABLE
- PROVIDER_REJECTED
- PAYMENT_PENDING
- PAYMENT_FAILED
- CHECKOUT_EXPIRED
- ENTITLEMENT_NOT_READY
- FORBIDDEN
- RATE_LIMITED

Do not expose provider secrets or raw internal error payloads to public clients.
