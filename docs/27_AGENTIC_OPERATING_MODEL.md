# ARO Agentic Operating Model

## Purpose

ARO is designed to be operable by humans and by Atlas WorkForce agents.

The long-term operating surface is not a standalone finance backoffice. It is a **Revenue/Finance capability inside Atlas WorkForce**, where structured systems, dashboards and Hermes agents work together.

## Functional role

Canonical role name:

**ARO Revenue & Finance Operator**

The visible human-friendly agent name/persona is intentionally not fixed by architecture.

The role may later be instantiated per:
- AtlasHub internal operations;
- business unit;
- external client tenant;
- region;
- portfolio.

## Core operating loop

```
Observe
→ Detect
→ Explain
→ Recommend
→ Request approval when required
→ Execute permitted action
→ Verify result
→ Audit
→ Learn from outcome
```

The agent never replaces the canonical ARO state machine.

ARO data is authority. Hermes reasons over it.

## Agent responsibilities

### Revenue monitoring
- revenue by project/product/channel;
- funnel conversion;
- order bump and upsell performance;
- AOV and LTV evolution;
- refund/chargeback trends;
- campaign-to-revenue attribution.

### Payment operations
- provider availability;
- success/decline rates;
- PIX expiration;
- webhook delays/errors;
- anomalous pending payments;
- retry/recovery queues;
- routing recommendation.

### Finance operations
- gross/net revenue;
- provider fees;
- settlement reconciliation;
- payout/settlement tracking;
- currency exposure;
- exception queues.

### Market intelligence
- payment methods by market;
- provider coverage;
- fee changes;
- new currencies;
- local rails;
- regulatory/operational changes;
- new provider candidates.

### Product intelligence
- which products convert;
- which offers/bundles underperform;
- price/offer experiments proposed for human approval;
- customer ownership/entitlement patterns.

## Authority boundaries

### Observe
Autonomous:
- read;
- summarize;
- detect anomaly;
- create internal alert;
- prepare report.

### Recommend
Autonomous recommendation only:
- route optimization;
- provider comparison;
- fee optimization;
- market/currency expansion;
- checkout improvements.

### Operate
Policy controlled:
- replay reconciliation;
- retry safe read/status operations;
- quarantine malformed provider event;
- disable route only if a pre-approved safety policy explicitly allows it.

### Sensitive actions
Human approval required:
- production routing changes;
- provider activation/deactivation;
- product price change;
- refund;
- entitlement manual grant/revoke;
- settlement adjustment.

### Treasury
Never autonomous in initial ARO:
- transfer funds;
- withdraw;
- change bank destination;
- change provider credentials;
- execute crypto/stablecoin transfer.

## Agent tooling model

Hermes should access ARO through explicit tools, never raw unrestricted database credentials.

Example tools:

- revenue_overview
- list_payment_exceptions
- get_order
- get_payment
- reconcile_payment
- compare_provider_health
- propose_route_change
- list_settlement_exceptions
- export_finance_report
- request_refund_approval
- request_route_change_approval

Every mutating tool has:
- tenant scope;
- action class;
- idempotency key;
- actor identity;
- reason;
- audit record.

## Memory

Agent memory must not become financial source of truth.

Durable facts belong in:
- ARO database;
- decision register;
- audit log;
- approved knowledge base.

Hermes may remember working preferences and operational context, but must re-read canonical financial state before making decisions.

## Multi-agent future

ARO may later support multiple specialized agents:

- Revenue Operator;
- Reconciliation Analyst;
- Provider/Payments Analyst;
- Market Expansion Analyst;
- Collections/Receivables Operator;
- Finance Controller Assistant.

They share the same ARO authority model and audit plane.

## Principle

**The agent can run the operation; it cannot redefine financial truth.**
