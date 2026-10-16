# ARO — Atlas Revenue Operations

ARO is AtlasHub's shared commerce, payment orchestration and entitlement API. A project (EspelhoMeu, LeveLab, Atlas Club, MyPets, …) sells digital access through ARO and **never integrates a payment provider directly**.

```
Project sales page
  → ARO checkout session          (project sends an offer code, never a price)
  → ARO payment router            (PixGo / MisticPay / Stripe — chosen by ARO)
  → provider confirms payment
  → ARO order APPROVED
  → ARO entitlement ACTIVE        (e.g. espelhomeu:p01)
  → project unlocks the product   (after resolving the entitlement with ARO)
```

## What ARO gives a project

- One API for PIX (Brazil) and card (international) payments.
- A central product/offer catalog: prices, currencies and entitlements are registered in ARO, so the browser can never set a price.
- Purchase-derived entitlements that the project checks before granting access.
- Signed webhooks to the project (notifications), with ARO as the authority.
- Refund/chargeback handling that revokes access automatically.

## What a project never does

- hold PixGo, MisticPay or Stripe credentials;
- implement provider webhooks or payment state machines;
- decide that a payment is approved from a browser redirect;
- write catalog rows or touch the AtlasHub database.

## Where to start

| You are… | Read |
|---|---|
| A project developer integrating ARO | [New Project Integration](integration/new-project.md) → [Checkout Sessions](api/checkout-sessions.md) → [Entitlements](api/entitlements.md) |
| A partner / external integrator | [Partners & Integrators](partners/README.md) |
| ARO operations (Infrastructure) | [Production Checklist](operations/production-checklist.md), [Manual Refund Operations](operations/manual-refunds.md) |
| Looking for a complete working example | [Golden Reference — EspelhoMeu](reference/golden-espelhomeu.md) |

## Source of truth

This handbook is published from the `atlashub-digital/atlashub-finance` repository (`docs/handbook/`). The repository is the technical source of truth; GitBook is the publication layer.

The API contract is [`openapi/aro-v1.yaml`](https://github.com/atlashub-digital/atlashub-finance/blob/main/openapi/aro-v1.yaml). Pages in this handbook explain behavior and link to it; when a page and the OpenAPI disagree, **the OpenAPI wins** and the page is a bug.
