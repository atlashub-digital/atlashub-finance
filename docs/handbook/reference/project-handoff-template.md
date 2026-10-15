# Project Handoff Template

Copy into the integration issue of a new project and send to ARO operations.

```yaml
project:
  slug:                 # lowercase, e.g. levelab
  name:
  repository:
  production_url:
  allowed_origins: []   # browser origins that may call checkout directly
  webhook_url:          # e.g. https://<domain>/api/aro/webhook (optional)

products:
  - code:
    name:
    type:               # ebook | course | community | membership | download | bundle | other

offers:
  - code:               # e.g. levelab-reset21-br
    name:
    products: []
    market: BR
    currency: BRL
    amount_minor:       # integer centavos — decided by the business owner
    cadence: once       # V1 supports once only at checkout
    payment_methods: [PIX]
    entitlements: []    # each key starts with "<slug>:"

fulfillment:
  - entitlement:
    type:               # web_access | telegram | whatsapp | download | external | none
    target:             # optional
```

## Protected surfaces

List the routes/features that require an entitlement (`/reader/…`, `/course/…`, `/members/…`).

## Events consumed

- [ ] `payment.approved`  - [ ] `payment.refunded`  - [ ] `payment.chargeback`
- [ ] `order.approved`  - [ ] `entitlement.granted`  - [ ] `entitlement.revoked`

## Definition of done

[Production Checklist](../operations/production-checklist.md).
