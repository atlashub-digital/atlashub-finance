# ARO Project Onboarding Runbook

## Goal

Connect any AtlasHub project to ARO without embedding provider-specific payment logic in that project.

The integration contract is intentionally small.

A project declares:

1. who it is;
2. what it sells;
3. in which markets/currencies;
4. which payment methods are allowed;
5. which entitlement(s) each offer grants;
6. where the buyer returns after payment;
7. which revenue events the project wants to consume.

ARO owns provider selection, payment state normalization, order state, provider events and revenue operations.

---

## 1. Project registration

Required fields:

```yaml
project:
  slug: levelab
  name: LeveLab
  owner: atlashub
  status: active
  default_market: BR
  default_currency: BRL
  checkout_return_url: https://levelab.org/checkout/retorno
  entitlement_callback_mode: aro
```

Another example:

```yaml
project:
  slug: atlas-club
  name: Atlas Club
  owner: atlashub
  status: active
  default_market: BR
  default_currency: BRL
  checkout_return_url: https://<domain>/checkout/retorno
  entitlement_callback_mode: aro
```

---

## 2. Product and offer registration

Products describe what the customer owns.

Offers describe how that product is sold.

Example:

```yaml
products:
  - id: levelab-reset21
    name: Reset 21
    entitlement_ref: levelab:reset21

offers:
  - id: levelab-reset21-br
    product_id: levelab-reset21
    market: BR
    currency: BRL
    amount_minor: 9900
    cadence: once
    enabled: true
```

Subscription example:

```yaml
products:
  - id: atlas-club-membership
    name: Atlas Club Membership
    entitlement_ref: atlas-club:membership

offers:
  - id: atlas-club-membership-br
    product_id: atlas-club-membership
    market: BR
    currency: BRL
    amount_minor: 2990
    cadence: month
    enabled: true
```

---

## 3. Payment policy

The project declares intent, not provider.

Example:

```yaml
payment_policy:
  - market: BR
    currency: BRL
    methods:
      - PIX
  - market: INTL
    currencies:
      - EUR
      - USD
    methods:
      - CARD
```

ARO resolves the actual provider.

Initial global defaults:

```
BR + BRL + PIX
→ PixGo primary
→ MisticPay fallback

International + CARD
→ Stripe
```

Project-specific overrides may exist later, but provider names should not appear in project frontend code.

---

## 4. Checkout integration

Project frontend sends:

```http
POST /v1/checkout-sessions
```

Example request:

```json
{
  "project": "levelab",
  "offer": "levelab-reset21-br",
  "market": "BR",
  "currency": "BRL",
  "method": "PIX",
  "customer": {
    "name": "...",
    "email": "...",
    "tax_id": "..."
  },
  "attribution": {
    "utm_source": "instagram",
    "utm_campaign": "reset21"
  }
}
```

ARO responds with a provider-independent checkout contract:

```json
{
  "checkout_session_id": "...",
  "order_id": "...",
  "status": "PENDING",
  "payment": {
    "method": "PIX",
    "copy_paste": "...",
    "qr_payload": "...",
    "expires_at": "..."
  }
}
```

The project renders the payment experience.

Provider-specific response fields never reach the project UI contract.

---

## 5. Payment confirmation

Project frontend must never decide that a payment is approved.

ARO receives provider webhook/status evidence and transitions:

```
PENDING
→ APPROVED
```

Then ARO:

1. updates payment;
2. updates order;
3. creates entitlement;
4. emits normalized revenue event.

---

## 6. Entitlement

Each offer maps to one or more entitlements.

Single product:

```
offer levelab-reset21-br
→ levelab:reset21
```

Bundle:

```
offer espelhomeu-colecao
→ espelhomeu:p01
→ espelhomeu:p02
→ espelhomeu:p03
→ espelhomeu:p04
→ espelhomeu:p05
```

Subscription:

```
offer atlas-club-membership-br
→ atlas-club:membership
```

Project asks ARO whether the customer owns the entitlement.

---

## 7. Project-side integration surface

A new project should ideally need only these integration points:

```
createCheckout()
getCheckoutStatus()
resolveEntitlements()
consumeRevenueEvent()   # optional
```

No provider adapter exists inside the project.

---

## 8. Environment variables per project

Project frontend/backend should only need ARO credentials/config:

```
ARO_API_URL=https://aro.atlashub...
ARO_PROJECT_ID=levelab
ARO_PUBLIC_KEY=...
ARO_SERVER_KEY=...
```

No:

```
PIXGO_API_KEY
MISTICPAY_CLIENT_SECRET
STRIPE_SECRET_KEY
```

Those belong only to ARO runtime/provider accounts.

---

## 9. Revenue events

ARO may emit normalized events:

```
lead.created
checkout.started
payment.pending
payment.approved
payment.failed
payment.refunded
order.approved
entitlement.granted
entitlement.revoked
subscription.started
subscription.renewed
subscription.canceled
```

Projects may consume only what they need.

Atlas WorkForce / Hermes may consume the complete normalized stream.

---

## 10. Onboarding checklist

For every new project:

- [ ] register project;
- [ ] register products;
- [ ] register offers/prices;
- [ ] map entitlements;
- [ ] define markets/currencies;
- [ ] define allowed payment methods;
- [ ] define return URL;
- [ ] configure project ARO credentials;
- [ ] connect checkout UI;
- [ ] test one controlled payment;
- [ ] verify APPROVED;
- [ ] verify entitlement;
- [ ] verify refund/revoke;
- [ ] activate production;
- [ ] add revenue notifications/analytics.

---

## 11. Definition of integrated

A project is ARO-integrated when:

```
Sales page
→ ARO checkout
→ provider chosen by ARO
→ payment confirmed by ARO
→ order approved
→ entitlement granted
→ project unlocks experience
```

and the project contains zero provider-specific payment business logic.

---

## 12. Fast onboarding target

After ARO V1 is stable, a new AtlasHub project should require:

- one project registration;
- product/offer configuration;
- entitlement mapping;
- 3–4 API calls;
- checkout UI integration;
- one controlled end-to-end payment test.

No new payment backend should be created per project.
