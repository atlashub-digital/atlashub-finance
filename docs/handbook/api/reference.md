# API Reference (OpenAPI)

The canonical contract is **[`openapi/aro-v1.yaml`](https://github.com/atlashub-digital/atlashub-finance/blob/main/openapi/aro-v1.yaml)** (OpenAPI 3.1). It is validated in CI on every change.

> GitBook: add an OpenAPI block to this page using the raw URL of `openapi/aro-v1.yaml` on the release branch. Do not paste schemas into pages — they would drift.

## Servers

| Environment | Base URL |
|---|---|
| Production | `https://aro.atlashub.si` |
| Controlled preview | `https://aro-preview.atlashub.si` (when provisioned) |

## Endpoints

| Method | Path | Auth | Page |
|---|---|---|---|
| GET | `/health` | none | — |
| POST | `/v1/checkout-sessions` | public key | [Checkout Sessions](checkout-sessions.md) |
| GET | `/v1/checkout-sessions/{checkout_session_id}` | checkout secret | [Checkout Sessions](checkout-sessions.md) |
| GET | `/v1/orders/{order_id}` | server key | [Orders](orders.md) |
| POST | `/v1/entitlements/resolve` | server key | [Entitlements](entitlements.md) |
| POST | `/v1/webhooks/providers/pixgo` | provider signature | [PixGo](../providers/pixgo.md) |
| POST | `/v1/webhooks/providers/misticpay` | verify-by-fetch | [MisticPay](../providers/misticpay.md) |
| POST | `/v1/webhooks/providers/stripe` | provider signature | [Stripe](../providers/stripe.md) |
| GET | `/v1/operator/projects/{project}/revenue/overview` | operator token | [Authentication](../integration/authentication.md) |

Outbound (ARO → project): the `projectRevenueEvent` webhook — see [Webhooks](webhooks.md).

## Conventions

- JSON bodies; money is `{ "amount_minor": <integer>, "currency": "<ISO-4217>" }`.
- Every response carries `x-request-id`; quote it when reporting a problem.
- Errors use one shape: `{ "error": "<CODE>", "message": "...", "request_id": "..." }` — see [Errors](errors.md).
- There is no refund endpoint in V1; see [Manual Refund Operations](../operations/manual-refunds.md).
