# ARO — Vision & Scope

## Mission

Atlas Revenue Operations (ARO) is the shared revenue operating layer of AtlasHub.

ARO exists to let AtlasHub-owned ventures and selected client projects sell, collect, reconcile, grant access and understand revenue without rebuilding provider-specific commerce stacks.

## Product definition

ARO combines five disciplines:

1. **Payment Orchestration** — provider routing and normalized payment lifecycle.
2. **Commerce Core** — offers, checkout, orders, bumps, upsells, refunds and entitlements.
3. **Revenue CRM-lite** — lead/customer revenue context and acquisition attribution.
4. **Finance Operations** — fees, settlements, reconciliation, payout references and exceptions.
5. **Revenue Intelligence** — conversion, provider performance, net revenue, AOV, LTV and campaign revenue.

## What ARO is not

ARO V1 is not:

- a bank;
- an acquiring institution;
- a stored-value wallet;
- a general accounting ERP;
- a generic B2B CRM;
- a replacement for all regulated payment infrastructure;
- a reimplementation of XPAYMENTS.

## Workforce integration

ARO is designed to appear inside Atlas Workforce / AtlasHub operational dashboards alongside agents and departments such as:

- attendants;
- marketing operators;
- operations managers;
- project managers;
- the **Finance / Revenue Operator Agent**.

ARO therefore exposes both machine APIs and operator-grade views.

## Long-term extensibility

The architecture must support future adapters and analytical dimensions without changing project checkout code:

- additional PSPs/acquirers;
- additional local payment rails;
- multicurrency;
- FX;
- wallets;
- bank transfer;
- subscriptions;
- invoices;
- blockchain settlement/adapters;
- stablecoin rails;
- on-chain verification;
- treasury/rebalancing.

These are extension points, not V1 launch requirements.

## Operating doctrine

1. Normalize before optimizing.
2. Providers are adapters, never business truth.
3. Orders and entitlements are Atlas-owned contracts.
4. Revenue operations are auditable.
5. Sensitive actions are policy-gated.
6. Automation can recommend broadly; movement of money remains explicitly governed.
7. EspelhoMeu is the proving ground, not a special-case architecture.
