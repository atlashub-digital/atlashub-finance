# Commerce & Checkout

> Background design note. The released checkout behavior is documented in [Checkout Sessions](./handbook/api/checkout-sessions.md).


## First-party principle

The checkout belongs to the project experience (EspelhoMeu, LeveLab, etc.) but obtains commerce authority from ARO.

```
Sales Page
→ Project Checkout UI
→ ARO Checkout Session
→ ARO Payment Router
→ Provider
→ ARO Event/Order
→ Entitlement
→ Project fulfillment
```

## EspelhoMeu BR fast launch

UX:
1. selected offer summary;
2. optional order bump;
3. minimal payer data;
4. PIX creation;
5. QR Code + Copia e Cola displayed in-page;
6. polling/status fallback;
7. webhook/payment confirmation;
8. entitlement grant;
9. Biblioteca/WebReader access;
10. optional post-purchase upsell.

## PIX payer data

Provider requirements define which payer fields are mandatory. The checkout asks only for data needed by the selected route and compliance policy.

Do not collect fields merely because another provider supports them.

## Order bump

An order bump is part of the same checkout/order.

It must:
- use an approved offer;
- show exact incremental price;
- default unchecked;
- be auditable in order_items.

## Upsell

V1 post-purchase upsell is a separate order unless the chosen provider supports a safe server-side one-click mechanism and the customer authorization model is explicit.

## Entitlement

Return URL / browser state never proves payment.

Grant requires normalized ARO payment state APPROVED.

Collection purchase:
`colecao → P01 + P02 + P03 + P04 + P05`

## Access recovery

Browser cookie may be used for a controlled pilot only.

Production hardening target:
- verified email/account identity;
- magic link;
- purchase recovery;
- cross-device entitlement resolution.
