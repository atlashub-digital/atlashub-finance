# ARO Developer Integration Kit — START HERE

## Audience

Use this document for any AtlasHub project that sells digital access, including:

- eBooks / WebReader;
- video courses / aulas;
- communities / groups;
- memberships / clubs;
- bundles / collections;
- digital downloads;
- hybrid digital products.

Examples: EspelhoMeu, LeveLab, LIA products, Atlas Club, MyPets, Receitas Sem Fronteiras, MyTrainX and future AMF projects.

## Rule #1

**Do not integrate a payment provider directly into the project.**

The project integrates with ARO.

```
Project
→ ARO API
→ ARO Payment Router
→ PixGo / MisticPay / Stripe / future providers
→ Order
→ Entitlement
→ Project fulfillment
```

## Canonical sources

Engineering source of truth:

1. `openapi/aro-v1.yaml`
2. `docs/35_PROJECT_INTEGRATION_CONTRACT_V1.md`
3. `examples/typescript/aro-checkout-client.ts`
4. `examples/typescript/verify-aro-webhook.ts`
5. `examples/typescript/resolve-entitlements.ts`
6. this Developer Integration Kit.

Architecture source of truth remains the ARO Foundation documentation in this repository.

## Fast integration path

Every project team performs only these steps:

1. register the project in ARO;
2. register products/offers;
3. map each offer to entitlement key(s);
4. configure project environment variables;
5. connect checkout UI to `POST /v1/checkout-sessions`;
6. poll/read checkout state;
7. receive optional signed ARO project webhook;
8. resolve entitlement server-side before protected access;
9. perform one controlled real payment;
10. verify refund/revoke.

## Minimum project ENV

```
ARO_API_URL=
ARO_PROJECT_SLUG=
ARO_PUBLIC_KEY=
ARO_SERVER_KEY=
ARO_WEBHOOK_SECRET=
```

Projects must not contain provider production credentials.

## Minimal frontend flow

```
Sales Page
→ user selects offer
→ project creates ARO checkout
→ display payment instruction
→ show PENDING
→ ARO confirms provider
→ APPROVED
→ redirect/open protected experience
```

## Minimal backend flow

```
Protected route
→ identify customer
→ POST /v1/entitlements/resolve
→ required entitlement ACTIVE?
    yes → allow
    no  → deny/recovery
```

## Webhook rule

ARO outbound webhooks are signed notifications.

They improve speed and local UX, but they are not the sole financial authority.

The project must be able to resolve the entitlement from ARO.

## Money

Always use:
- integer minor units;
- ISO-4217 currency.

Examples:

```
R$ 11,90 → 1190 BRL
€ 29,00  → 2900 EUR
$ 35.00  → 3500 USD
```

Never use floating-point money.

## What a project team must NOT build

Do not create:
- PixGo adapter;
- MisticPay adapter;
- Stripe secret integration;
- provider webhook state machine;
- provider routing;
- payment reconciliation;
- duplicate financial truth.

Those belong to ARO.

## Definition of integrated

A project is ARO-integrated when:

```
Offer
→ ARO checkout
→ payment APPROVED
→ order APPROVED
→ entitlement ACTIVE
→ protected digital content unlocked
```

and changing the payment provider does not require changing project business logic.

## Next

Read:
- `INTEGRATION_RECIPES.md`
- `ENVIRONMENTS.md`
- `ACCEPTANCE_CHECKLIST.md`

Then fill:
- `PROJECT_HANDOFF_TEMPLATE.md`
