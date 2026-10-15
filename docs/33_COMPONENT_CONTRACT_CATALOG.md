# ARO Component Contract Catalog

## Purpose

This file is the implementation-facing map of ARO LEGO pieces.

Each component has an explicit owner boundary and stable contract target.

## C01 — Project Registry

**Responsibility**
Identify tenant/project/business unit.

**Inputs**
- project slug
- tenant
- market policy

**Outputs**
- project_id
- enabled capabilities
- configuration references

**Must not**
Contain provider credentials.

## C02 — Product / Offer Registry

**Responsibility**
Define what can be sold.

**Inputs**
- project
- product
- price
- currency
- availability
- entitlement mapping

**Outputs**
- canonical offer_id
- amount/currency
- fulfillment map

**Must not**
Contain provider-specific payment IDs as business identity.

## C03 — Checkout Session

**Responsibility**
Capture a commercial intent before payment.

**Inputs**
- project_id
- offer_id
- bumps
- payer requirements
- attribution
- market
- currency
- method

**Outputs**
- checkout_session_id
- selected items
- route request

## C04 — Payment Router

**Responsibility**
Choose eligible provider/account.

**Inputs**
- market
- currency
- method
- amount
- payer capabilities
- project policy
- provider health

**Outputs**
- route decision
- provider account
- reason/evidence

**Initial**
PRIORITY_FAILOVER.

## C05 — Provider Adapter

**Responsibility**
Translate ARO commands/events to/from a provider.

**Contract**
- capabilities
- createPayment
- recoverCreate
- getPayment
- refund where supported
- verifyWebhook
- normalizeStatus
- healthCheck

**Adapters**
- PixGo
- MisticPay
- Stripe
- future rails

## C06 — Payment Attempt

**Responsibility**
Record one routed execution attempt.

**States**
- CREATED
- AMBIGUOUS
- REJECTED
- UNAVAILABLE
- CONFIRMED

The attempt is not the same as the canonical payment.

## C07 — Canonical Payment

**Responsibility**
Represent provider-independent payment state.

**States**
- CREATED
- PENDING
- APPROVED
- FAILED
- CANCELED
- REFUNDED
- CHARGEBACK

## C08 — Provider Event Inbox

**Responsibility**
Durably ingest provider notifications.

**Properties**
- immutable receipt identity
- raw payload hash/reference
- trust policy result
- idempotency
- replay/reconciliation state

## C09 — Order

**Responsibility**
Commercial purchase record.

**Inputs**
- checkout session
- selected items
- canonical payment

**Outputs**
- order
- items
- status transitions

## C10 — Entitlement

**Responsibility**
Convert approved commercial rights into product access.

**Inputs**
- order item
- fulfillment mapping
- payment/order status

**Outputs**
- grant
- revoke
- expiry

**Invariant**
Provider adapters never grant access directly.

## C11 — Customer / Revenue Profile

**Responsibility**
Revenue-oriented view of a contact/customer.

**Contains**
- project identities
- purchases
- product ownership
- attribution
- LTV inputs
- refunds

**Does not replace**
General-purpose B2B CRM.

## C12 — Funnel Events

**Responsibility**
Connect acquisition → sales surface → checkout → revenue.

**Examples**
- lead captured
- sales page view
- checkout started
- payment created
- payment approved
- bump accepted
- upsell accepted

Private reflection/health content is never used as targeting payload.

## C13 — Ledger

**Responsibility**
Operational financial representation.

**Entries**
- gross sale
- provider fee
- refund
- chargeback
- adjustment
- settlement
- FX difference where applicable

## C14 — Reconciliation

**Responsibility**
Compare ARO expected state with provider/settlement state.

**Outputs**
- matched
- exception
- resolution
- evidence

## C15 — Provider Health

**Responsibility**
Measure operational provider quality.

**Signals**
- API health
- create success
- confirmation latency
- webhook latency
- error rate
- reconciliation exceptions

## C16 — Market Capability Registry

**Responsibility**
Track provider/payment-market capabilities.

**Dimensions**
- country
- currency
- method
- provider
- payer fields
- limits
- settlement
- verified_at

## C17 — Revenue Intelligence

**Responsibility**
Aggregate actionable revenue metrics.

**Metrics**
- GMV
- net revenue
- conversion
- AOV
- LTV
- bump/upsell conversion
- provider success
- refund rate
- revenue by campaign/project/market

## C18 — WorkForce Revenue Module

**Responsibility**
Human operating UI inside Atlas WorkForce.

**Surfaces**
- dashboard
- operations queues
- approvals
- provider/routing controls
- reports
- agent panel

## C19 — Hermes Revenue/Finance Operator

**Responsibility**
Observe, explain, recommend and perform policy-permitted operations.

**Never**
Own canonical financial state.

## C20 — Approval & Audit

**Responsibility**
Govern sensitive human/agent actions.

**Stores**
- actor
- action
- class
- scope
- reason
- evidence
- approval
- result
- timestamp

## Integration invariant

A project integration should require only:

```
project_id
offer_id
market
currency
method
attribution
payer fields required by selected route
```

Everything after route selection is an ARO concern.

## Replacement test

Each block is healthy when it can be replaced independently without changing unrelated project UX.

Examples:
- replace PixGo → no change to EspelhoMeu sales page;
- replace Supabase implementation → no change to provider API;
- replace Hermes model → no change to payment truth;
- add stablecoin rail → no change to entitlement contract.
