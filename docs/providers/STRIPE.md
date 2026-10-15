# Provider Adapter — Stripe

## Role

Initial international payment provider for ARO.

Stripe is not the default BR PIX route under the current ARO decision.

## Adapter responsibilities

- create international/card/local-method payment;
- normalize payment states;
- verify webhooks;
- capture provider fees where available;
- support refunds/chargebacks;
- preserve provider IDs as external references.

## Project boundary

Project UI may embed Stripe Elements/Checkout components, but:
- provider choice is resolved by ARO;
- orders/payments remain ARO canonical;
- entitlement is based on normalized ARO payment state.

## Future

Additional international PSPs can be added without changing EspelhoMeu/LeveLab commerce contracts.

## Reference

- https://docs.stripe.com/payments
