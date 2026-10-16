# Stripe

International card provider (EUR, USD). Stripe is not the BR PIX route.

| Aspect | Behavior in ARO |
|---|---|
| API | PaymentIntents over HTTPS (`https://api.stripe.com/v1`), secret key as Bearer |
| Create | `POST /payment_intents` with amount (already minor units), currency, automatic payment methods, metadata `aro_attempt_id`/`aro_order_id`, `Idempotency-Key` = ARO attempt idempotency key |
| Instruction | `{ "kind": "CARD", "client_secret": "…" }` for Stripe Elements/Payment Element in the project UI |
| Status | `requires_*`/`processing → PENDING`, `succeeded → APPROVED`, `canceled → CANCELED`. A declined card leaves the intent payable (`PENDING`), so the buyer can retry |
| Webhooks | `payment_intent.*`, `charge.refunded` (full refunds), `charge.dispute.created` |
| Trust | **SIGNED**: `Stripe-Signature` `v1` = HMAC-SHA256 over `t + "." + raw_body`, 300 s tolerance |
| Ambiguous create | safe: re-sending with the same Idempotency-Key returns the same intent; lookups use metadata search |
| Fees | not captured in V1 |

The project UI may embed Stripe's card components, but provider choice, payment state and entitlements stay in ARO. The project never holds the Stripe secret key.

## Webhook endpoint (ARO operations)

Create a Stripe endpoint for `https://aro.atlashub.si/v1/webhooks/providers/stripe` with events `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`.

## Secrets (ARO only)

`ARO_SECRET_ARO_ATLASHUB_STRIPE_PROD__SECRET_KEY`, `ARO_SECRET_ARO_ATLASHUB_STRIPE_PROD__WEBHOOK_SECRET`.

## Refunds

From the Stripe dashboard. Only **full** refunds (`charge.refunded` with `refunded: true`) reverse the order; partial refunds are not modeled in V1.
