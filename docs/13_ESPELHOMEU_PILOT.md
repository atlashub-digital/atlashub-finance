# EspelhoMeu — ARO Pilot

> Pilot intent. The current integration is the [Golden Reference — EspelhoMeu](./handbook/reference/golden-espelhomeu.md); the execution checklist is [docs/41](./41_ESPELHOMEU_PILOT_EXECUTION.md).


## Objective

Make EspelhoMeu the first production proof of ARO.

Success condition:

> An external user reaches a sales page, buys by PIX in Brazil, ARO confirms payment, grants the correct entitlement, and the user opens the purchased WebReader content.

## Offers

- P01 — R$11,90
- P02 — R$19,90
- P03 — R$29,90
- P04 — R$24,90
- P05 — R$29,90
- Coleção — R$79,90

Jornada and Membership remain non-purchasable until fulfillment is ready.

## BR checkout

```
EspelhoMeu
→ ARO checkout session
→ PIX route
→ PixGo or MisticPay
→ QR + Copia e Cola
→ provider confirmation
→ ARO payment APPROVED
→ order APPROVED
→ entitlement
→ Biblioteca / WebReader
```

## International

```
EspelhoMeu
→ ARO
→ Stripe
→ normalized payment
→ same ARO order/entitlement model
```

## PR #30 relationship

The existing EspelhoMeu PR #30 contains useful checkout/order/entitlement prototype code.

Target:
- preserve useful project checkout UI;
- preserve tested sales funnels;
- move provider selection and canonical commerce authority behind ARO contracts;
- do not retain Stripe-only business logic in the project.

## Fast-launch order

1. ARO contracts/schema.
2. EspelhoMeu project registration/offers.
3. PixGo adapter.
4. MisticPay adapter/fallback.
5. PIX checkout UI.
6. webhook/status normalization.
7. entitlement.
8. controlled low-value transaction.
9. production smoke.
10. sales release.
