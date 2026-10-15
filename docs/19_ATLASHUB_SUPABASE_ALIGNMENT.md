# AtlasHub Supabase Alignment

## Purpose

ARO will use the existing AtlasHub Supabase project as its central data plane.

Project:
- name: AtlasHub
- ref: `aakdyumavlzgyklbrsrw`
- status observed during ARO foundation: ACTIVE_HEALTHY

This document prevents ARO from duplicating capabilities that already exist in the AtlasHub operational schema.

## Existing reusable substrate

AtlasHub already contains tenant-aware, RLS-enabled building blocks for CRM, catalog, commerce and billing.

### Core tenancy

Existing:
- `public.Tenant`
- `public.Project`

ARO should reuse AtlasHub tenant/project identity rather than introduce a parallel project registry unless a later migration deliberately replaces the existing model.

### Catalog

Existing:
- `catalog_product`
- `catalog_price`

Useful existing price dimensions include:
- currency
- pricingModel
- interval
- amountMinor
- market
- taxBehavior
- status

ARO should extend/adapt this catalog for project offers instead of creating a second independent product/price source of truth.

### CRM

Existing:
- `crm_contact`
- `crm_lead`
- `crm_consent`
- `crm_activity`
- suppression/import support

Useful existing revenue context:
- tenant
- normalized contact identity
- source
- stage
- UTM
- locale
- consent

ARO Revenue CRM-lite should consume/extend these records rather than duplicate customers/leads.

### Commerce

Existing:
- `commerce_quote`
- `commerce_quote_line`
- `commerce_order`
- `commerce_subscription`
- `commerce_entitlement`

ARO can reuse the canonical concepts of order/subscription/entitlement, subject to a migration review for consumer/e-commerce needs that were not present in the original B2B/WaaS commerce design.

### Billing

Existing:
- `billing_account`
- `billing_invoice`
- `billing_invoice_line`
- `billing_payment`
- `billing_webhook_event`
- issuer/delivery support

Existing payment normalization already includes:
- provider
- providerRef
- method
- status
- amountMinor
- currency
- checkout JSON
- paidAt

Existing webhook inbox already includes:
- provider
- eventId
- eventType
- providerRef
- payloadSha256
- facts
- processing status/attempts/error
- tenantId
- received/processed timestamps

These are strong foundations for ARO and should not be rebuilt without a concrete gap.

## Missing ARO orchestration primitives

The current AtlasHub data model does not yet clearly expose the following ARO concepts as first-class entities:

1. **provider_accounts**
   - merchant/account configuration
   - environment
   - credential_ref
   - capabilities
   - active/degraded state

2. **payment_routes**
   - project/tenant
   - market/country
   - currency
   - method
   - provider account
   - priority
   - rule version
   - effective_at
   - conditions

3. **payment_attempts**
   - one order may have multiple provider attempts
   - route snapshot
   - provider external payment id
   - normalized state/error
   - prevents provider choice from being conflated with the order itself

4. **checkout_sessions**
   - public checkout lifecycle before order/payment completion
   - attribution snapshot
   - selected order bump
   - route decision
   - expiry

5. **refund / chargeback normalization**
   - provider-independent reversal lifecycle

6. **operational ledger**
   - gross
   - provider fee
   - refund
   - chargeback
   - adjustment
   - settlement/payout references

7. **settlement / reconciliation**
   - settlement batches
   - reconciliation exceptions
   - provider financial truth vs Atlas truth

8. **provider health / routing telemetry**
   - latency
   - success rate
   - health/degradation
   - route decision evidence

9. **revenue funnel events**
   - where existing CRM activity is insufficient for high-volume product funnels

## Recommended implementation strategy

Do **not** create a second full `aro.*` copy of CRM/catalog/commerce/billing.

Preferred V1:

```
Existing AtlasHub public model
├── Tenant / Project
├── catalog_*
├── crm_*
├── commerce_*
└── billing_*
        +
ARO additive orchestration tables
├── aro_provider_account
├── aro_payment_route
├── aro_checkout_session
├── aro_payment_attempt
├── aro_refund
├── aro_ledger_entry
├── aro_settlement
├── aro_reconciliation_exception
└── aro_provider_health
```

Naming can be revisited before migration. The important decision is **additive reuse**, not a parallel duplicate domain.

## Project scoping

Existing AtlasHub tables are primarily `tenantId` scoped.

ARO must define the exact relationship:

```
Tenant
  └── Project
       └── Offer / Checkout / Revenue activity
```

Where existing commerce/billing tables lack `projectId`, ARO should add project linkage or a stable reference in a versioned migration instead of overloading tenant identity.

EspelhoMeu should be registered as a Project under the appropriate AtlasHub Tenant before centralized ARO production records are written.

## Entitlements

Existing `commerce_entitlement` has:
- tenantId
- key
- source
- sourceId
- quantity
- validity
- status

This is compatible with the ARO concept.

For EspelhoMeu, entitlement keys can be standardized such as:

- `espelhomeu:p01`
- `espelhomeu:p02`
- `espelhomeu:p03`
- `espelhomeu:p04`
- `espelhomeu:p05`

A Collection order grants five entitlement records.

## Webhook inbox

Existing `billing_webhook_event` should be evaluated as the shared provider event inbox.

ARO-specific additions may include:
- trust_level: SIGNED / VERIFIED_BY_FETCH / UNTRUSTED
- projectId
- paymentAttemptId
- normalized event type

Do not duplicate the inbox if these fields can be added compatibly.

## Security posture observed

Relevant commerce, billing and CRM tables inspected in AtlasHub have RLS enabled.

One separate existing table, `public.waas_migrations`, was reported by Supabase as having RLS disabled.

This is **not an ARO change** and must not be auto-remediated because enabling RLS without policies can block an existing runtime. It should be reviewed separately by AtlasHub infrastructure/security ownership.

Reference:
https://supabase.com/docs/guides/database/postgres/row-level-security

## V1 migration gate

Before applying ARO DDL:

1. inspect existing constraints/indexes/RLS policies;
2. decide Project↔Tenant mapping for EspelhoMeu;
3. define additive orchestration tables only;
4. review migration with infrastructure ownership;
5. apply on controlled scope;
6. run Supabase security/performance advisors;
7. verify SQL reads/writes and RLS;
8. then connect EspelhoMeu pilot.

## Decision

The draft `14_SUPABASE_SCHEMA_V1.sql` remains an architectural reference only.

It must **not** be applied as-is because the live AtlasHub database already implements substantial overlapping CRM/catalog/commerce/billing capability.

The production ARO schema will be derived from this alignment and an explicit gap migration.
