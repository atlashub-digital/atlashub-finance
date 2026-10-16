# ARO Architecture V1

## 1. Definition

**Atlas Revenue Operations (ARO)** is the central commerce and revenue operations platform for AtlasHub.

Conceptually:

> Payment Orchestration + Commerce Core + E-commerce CRM-lite + Finance Ops + Revenue Intelligence.

ARO incorporates the operational lessons learned from XPAYMENTS, but is intentionally cleaner, multi-project and provider-agnostic.

ARO does not initially hold or transmit funds itself. Providers continue to execute regulated payment processing.

## 2. Strategic boundary

### ARO owns

- project/tenant commerce configuration;
- product and offer registry;
- checkout intents/sessions;
- order lifecycle;
- provider routing;
- normalized payment state;
- payment event ingestion;
- refunds/chargebacks state;
- entitlement issuance/revocation;
- customer/lead revenue context;
- campaign attribution;
- financial ledger representation;
- provider fee/settlement reconciliation;
- revenue dashboards and reporting.

### Projects own

- product experience;
- landing/sales pages;
- brand/UI;
- content;
- product-specific fulfillment experience.

Projects consume ARO through API/contracts. They should not directly depend on PixGo, MisticPay or Stripe schemas.

### Providers own

- payment execution;
- regulated payment data;
- PIX/card rails;
- settlement and payout execution;
- provider-specific authorization/fraud flows.

## 3. Multi-project model

Every commercial object is scoped by `project_id`.

Examples:

- `espelhomeu`
- `levelab`
- `atlashub`
- `atlas-editions`

A project can have multiple markets, currencies and providers.

## 4. Canonical domains

### Catalog

- projects
- products
- offers
- prices
- bundles
- subscriptions

### Customer / CRM-lite

- contacts
- leads
- customer identities
- consent references
- campaign attribution
- touchpoints
- funnel events

This is not intended to replace a full sales CRM. It is the revenue-oriented customer context required to understand acquisition → checkout → purchase → retention.

### Commerce

- checkout_sessions
- orders
- order_items
- upsells / order bumps
- refunds
- entitlements

### Payment orchestration

- provider_accounts
- provider_capabilities
- payment_routes
- payment_attempts
- payments
- payment_events
- provider health

### Finance operations

- ledger_entries
- provider_fees
- settlements
- payouts / settlement references
- reconciliations
- adjustments

### Revenue intelligence

- funnel conversion
- revenue by product/project/channel
- AOV
- order bump / upsell rate
- refund rate
- provider success rate
- net revenue
- campaign revenue/ROAS inputs
- customer LTV

## 5. Supabase data plane

> Superseded by ADR-013 / [docs/39](./39_ARO_DATA_PLANE_GAP_ANALYSIS.md): ARO does not create a separate `aro` schema. It reuses the AtlasHub public tables and adds `aro_*` orchestration tables. The list below is the original conceptual model.

Recommended central Supabase schema:

`aro`

Initial tables:

- `aro.projects`
- `aro.contacts`
- `aro.leads`
- `aro.products`
- `aro.offers`
- `aro.checkout_sessions`
- `aro.orders`
- `aro.order_items`
- `aro.provider_accounts`
- `aro.payment_routes`
- `aro.payment_attempts`
- `aro.payments`
- `aro.payment_events`
- `aro.refunds`
- `aro.entitlements`
- `aro.funnel_events`
- `aro.ledger_entries`
- `aro.settlements`

All domain records use Atlas-generated UUIDs. Provider IDs are external references only.

## 6. Provider normalization

Provider-specific payloads are translated into ARO contracts.

Canonical payment fields include:

- id
- project_id
- order_id
- provider
- provider_account_id
- provider_payment_id
- payment_method
- currency
- amount_gross_minor
- provider_fee_minor
- amount_net_minor
- status
- created_at
- authorized_at
- paid_at
- refunded_at

Canonical statuses should remain small and stable:

- CREATED
- PENDING
- APPROVED
- FAILED
- CANCELED
- REFUNDED
- CHARGEBACK

Provider-specific statuses remain in audit metadata.

## 7. Payment Router

Project frontends do not select PixGo/MisticPay/Stripe directly.

Example request:

```json
{
  "project": "espelhomeu",
  "offer": "p01",
  "market": "BR",
  "currency": "BRL",
  "method": "PIX"
}
```

ARO evaluates `payment_routes`.

Example:

| project | market | currency | method | provider | priority |
|---|---|---|---|---|---:|
| espelhomeu | BR | BRL | PIX | pixgo | 10 |
| espelhomeu | BR | BRL | PIX | misticpay | 20 |
| espelhomeu | INTL | EUR | CARD | stripe | 10 |
| espelhomeu | INTL | USD | CARD | stripe | 10 |

Later routing dimensions may include:

- transaction amount;
- provider health;
- cost;
- success rate;
- risk;
- merchant account capacity;
- project overrides.

## 8. Secrets

Provider secrets must not be stored as plaintext business configuration.

`provider_accounts` stores references such as:

`credential_ref = "aro/espelhomeu/pixgo/prod"`

Actual credentials live in a secrets manager / Supabase Vault / deployment secret storage.

## 9. Entitlements

Entitlements are central and provider-independent.

Example:

```
order EM-1001
offer colecao
→ entitlement p01
→ entitlement p02
→ entitlement p03
→ entitlement p04
→ entitlement p05
```

A refund/chargeback can generate entitlement revocation policy independently of provider details.

## 10. Revenue CRM-lite

ARO should answer:

- which lead/customer bought;
- from which project;
- which campaign/touchpoint;
- what checkout they entered;
- what they bought;
- which bump/upsell converted;
- how much gross/net revenue resulted;
- which products they already own.

It should not initially become a generic pipeline CRM for unrelated B2B sales processes.

## 11. ARO Finance Workspace

AtlasHub UI can expose a Revenue/Finance workspace:

- Overview
- Projects
- Sales
- Orders
- Payments
- Customers
- Offers
- Providers
- Routing
- Refunds
- Entitlements
- Settlements
- Reconciliation
- Funnels
- Reports

## 12. Relationship with XPAYMENTS

ARO is not simply XPAYMENTS renamed.

XPAYMENTS provides valuable operational patterns around:

- gateway abstraction;
- payment lifecycle;
- fee accounting;
- reconciliation;
- payouts;
- auditability.

ARO uses those lessons but expands the model into:

- multi-project commerce;
- centralized catalog/offers;
- e-commerce funnel context;
- lead/customer revenue context;
- entitlements;
- acquisition attribution;
- revenue intelligence.

XPAYMENTS may later be integrated as a provider/service, migrated into ARO components, or remain a specialized payments platform. This decision is separate from ARO V1.

## 13. EspelhoMeu pilot

EspelhoMeu becomes the first ARO client.

Target:

```
EspelhoMeu Sales Page
→ ARO Checkout
→ BR: PIX Router → PixGo / MisticPay
→ INTL: Stripe
→ ARO Order
→ ARO Payment
→ ARO Entitlement
→ EspelhoMeu Library / WebReader
```

The current EspelhoMeu PR #30 should be treated as prototype/integration work. Provider-agnostic commerce contracts should migrate toward ARO instead of becoming permanent EspelhoMeu-owned infrastructure.

## 14. V1 delivery sequence

### ARO-0 — Foundation
- canonical domain contracts
- Supabase schema
- projects
- provider registry
- offer registry

### ARO-1 — Payment orchestration
- payment router
- PixGo adapter
- MisticPay adapter
- Stripe adapter
- webhook normalization
- payment attempts

### ARO-2 — Commerce
- checkout sessions
- orders
- items
- bumps/upsells
- refunds
- entitlements

### ARO-3 — Revenue Ops
- funnel events
- contact/customer revenue profile
- ledger
- fees
- settlements/reconciliation

### ARO-4 — AtlasHub UI
- revenue dashboard
- payment/provider operations
- project drill-down
- reports

## 15. Launch doctrine

Do not build the entire ARO platform before launching EspelhoMeu.

Use EspelhoMeu as the proving ground:

1. define the central contracts;
2. implement only the tables/services required by the pilot;
3. connect PIX providers for BR;
4. connect Stripe for international;
5. validate purchase → payment → entitlement;
6. launch;
7. generalize from real transactions.
