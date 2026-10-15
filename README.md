# Atlas Revenue Operations (ARO)

**ARO — Atlas Revenue Operations** is AtlasHub's shared revenue operating layer.

It combines:

- Payment orchestration;
- Commerce core;
- Revenue CRM-lite;
- Entitlements;
- Finance operations;
- Reconciliation;
- Revenue intelligence.

ARO is **not** a payment processor, acquiring bank, wallet, or PSP in its first version. It orchestrates external providers and normalizes commercial and financial events across AtlasHub projects.

## First pilot

**EspelhoMeu** is the first tenant/pilot.

The same core must later support, without rebuilding payment logic:

- LeveLab / LIA;
- AtlasHub Editions;
- AtlasHub products and subscriptions;
- future AMF verticals;
- external client projects where applicable.

## Core principle

Projects do not implement provider-specific payment logic.

They call ARO using Atlas identifiers:

```
project + offer + market + currency + payment method
```

ARO resolves the route:

```
Project
  → Offer
  → Checkout Session
  → Payment Router
      → PixGo
      → MisticPay
      → Stripe
  → Provider Event
  → Normalized Payment
  → Order
  → Entitlement
  → Ledger / Revenue Analytics
```

## Initial routing intent

- Brazil / BRL / PIX → PixGo and MisticPay;
- International / cards and eligible local methods → Stripe.

Routing is configuration, not frontend code.

## Source of truth

ARO becomes the common revenue data plane for:

- leads and customer identity references;
- checkout sessions;
- orders;
- payments;
- refunds / chargebacks;
- entitlements;
- provider fees;
- settlements;
- campaign attribution;
- revenue funnel events.

See `docs/ARO_ARCHITECTURE_V1.md`.


## Documentation

Start with the canonical index:

- [ARO Master Blueprint](./docs/MASTER_BLUEPRINT.md)
- [ARO Documentation Index](./docs/INDEX.md)
- [Architecture V1](./docs/ARO_ARCHITECTURE_V1.md)
- [Hermes Finance Operator](./docs/08_HERMES_FINANCE_OPERATOR.md)
- [Atlas Workforce Revenue Module](./docs/16_ATLAS_WORKFORCE_REVENUE_MODULE.md)
- [EspelhoMeu Pilot](./docs/13_ESPELHOMEU_PILOT.md)

The repository is the source of truth for ARO architecture, contracts, provider adapters, operating procedures and decision records.
