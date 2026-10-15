# ARO Master Blueprint

## Canonical identity

**Name:** Atlas Revenue Operations  
**Acronym:** ARO  
**Role:** Revenue operating module for AtlasHub / Atlas WorkForce.

## Product thesis

ARO gives AtlasHub and permitted client tenants one shared operational layer connecting:

```
Lead
→ Campaign
→ Offer
→ Checkout
→ Provider
→ Payment
→ Order
→ Entitlement
→ Revenue
→ Settlement
→ Intelligence
→ Operator / Agent
```

## What ARO is

- shared commerce infrastructure;
- payment orchestration;
- revenue CRM-lite;
- entitlement authority;
- operational finance/reconciliation;
- revenue intelligence;
- Atlas WorkForce Revenue department;
- future Hermes-operated module.

## What ARO is not

- a new XPAYMENTS clone;
- a bank;
- an acquirer;
- a PSP in V1;
- a custody platform;
- a full ERP;
- a generic sales CRM;
- an autonomous treasury.

## Initial production proof

**EspelhoMeu**

Success:

```
external buyer
→ EspelhoMeu offer
→ first-party checkout
→ BR PIX
→ PixGo/MisticPay
→ confirmed payment
→ ARO-normalized order
→ entitlement
→ WebReader unlocked
```

## Current priority

Do not delay EspelhoMeu for platform completeness.

Priority order:
1. prove checkout;
2. prove provider confirmation;
3. prove entitlement;
4. prove revoke/refund path;
5. release sales;
6. extract stable shared logic;
7. expand ARO.

## Future operating model

ARO becomes a visible Revenue capability inside Atlas WorkForce.

A Hermes operator continuously monitors:
- sales;
- providers;
- exceptions;
- fees;
- reconciliation;
- settlements;
- currencies;
- markets;
- opportunities.

Human approval remains mandatory for sensitive commerce/treasury actions.

## Future rails

ARO must be extensible to:
- new PIX providers;
- card PSPs/acquirers;
- local payment methods;
- open banking;
- multicurrency;
- FX providers;
- stablecoins;
- blockchain settlement.

These are adapters/capabilities, not reasons to redesign the core.

## Canonical documentation map

See:
- INDEX.md
- ARO_ARCHITECTURE_V1.md
- 25_LEGO_COMPONENT_MAP.md
- 33_COMPONENT_CONTRACT_CATALOG.md
- 27_AGENTIC_OPERATING_MODEL.md
- 28_MARKET_CURRENCY_INTELLIGENCE.md
- 30_WORKFORCE_FINANCE_AGENT_UX.md
- 32_REPOSITORY_STANDARD.md

## Source-of-truth hierarchy

1. Runtime contracts/schema
2. Repository canonical docs
3. Decision register
4. Provider documentation/evidence
5. Operational runbooks
6. Chat/task instructions

Chat cannot silently redefine layers 1–5.

## Principle

**ARO should become sophisticated because AtlasHub grows, not before AtlasHub sells.**
