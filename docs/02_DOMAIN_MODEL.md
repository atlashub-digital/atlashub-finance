# ARO Domain Model

## Identity hierarchy

```
AtlasHub
  └─ Organization / Business Unit
      └─ Project
          └─ Market
              └─ Commercial Offer
```

Every commercial object carries `project_id`. Where required, it also carries `organization_id` or `business_unit_id`.

## Core entities

### projects
Commercial tenants such as EspelhoMeu, LeveLab and AtlasHub Editions.

Minimum:
- id
- slug
- legal_entity_ref
- name
- default_currency
- status
- metadata

### contacts
Minimal person/customer identity reference.

Minimum:
- id
- project_id
- email_hash / normalized email where lawful and required
- external identity refs
- locale
- market
- consent refs
- created_at

### leads
Pre-purchase commercial context.

Minimum:
- id
- project_id
- contact_id
- source
- campaign_id
- status
- first_touch_at
- last_touch_at

### products
Fulfillment units.

Examples:
- EspelhoMeu P01
- EspelhoMeu P05
- LIA Membership

### offers
Commercial propositions that resolve to one or more products.

Examples:
- P01 R$11,90
- Coleção R$79,90 → P01..P05
- future Membership → recurring entitlement

### checkout_sessions
One commercial attempt initiated by a user.

Contains:
- project
- offer
- selected bump/upsell
- market/currency/method
- attribution snapshot
- route decision
- state
- expires_at

### orders
Provider-independent commercial order.

Status:
- CREATED
- PENDING
- APPROVED
- FAILED
- CANCELED
- REFUNDED
- CHARGEBACK

### order_items
Immutable commercial item snapshot.

### payment_attempts
Each provider execution attempt. Multiple attempts may belong to one checkout/order.

### payments
Normalized result of a successful or terminal payment execution.

### payment_events
Provider event inbox / audit.

### entitlements
Access rights derived from an order, membership or operator action.

### refunds
Normalized refund state independent from provider payload.

### ledger_entries
Operational financial representation; append-only.

### settlements
Provider settlement or payout batch references.

### funnel_events
Revenue funnel telemetry; never private journal/reflection content.

## Money representation

Internal canonical amounts use integer minor units where currency supports them:

- BRL 1190 = R$11,90
- EUR 2900 = €29,00

Provider adapters convert provider-specific numeric formats at the edge.

## External references

Never use provider transaction IDs as Atlas primary keys.

Store:
- `provider`
- `provider_account_id`
- `provider_payment_id`
- `provider_event_id`

as external references.

## Immutability

Orders may change status; commercial item snapshots do not mutate after purchase.

Ledger entries and payment events are append-only.

Corrections produce compensating entries, not destructive edits.
