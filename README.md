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


## Engineering contracts

Implementation must follow the versioned contracts:

- [OpenAPI V1](./openapi/aro-v1.yaml)
- [Project Integration Contract V1](./docs/35_PROJECT_INTEGRATION_CONTRACT_V1.md)
- [Hermes Tool Contract V1](./docs/36_HERMES_TOOL_CONTRACT_V1.md)
- [Backend Implementation Specification V1](./docs/37_BACKEND_IMPLEMENTATION_SPEC_V1.md)

Projects integrate with ARO, not provider APIs.


## Developer Integration Kit

For project teams integrating ARO into a digital product, start here:

- [Developer START HERE](./docs/developer/START_HERE.md)
- [Integration Recipes](./docs/developer/INTEGRATION_RECIPES.md)
- [Environment Matrix](./docs/developer/ENVIRONMENTS.md)
- [Acceptance Checklist](./docs/developer/ACCEPTANCE_CHECKLIST.md)
- [Project Handoff Template](./docs/developer/PROJECT_HANDOFF_TEMPLATE.md)
- [Standard Team Message](./docs/developer/TEAM_MESSAGE.md)

The OpenAPI remains the canonical API contract:
- [ARO OpenAPI V1](./openapi/aro-v1.yaml)


### Catalog-first project bootstrap

New digital projects should use a versioned `aro.project.yaml` manifest.

References:
- [Project Commerce Bootstrap](./docs/developer/PROJECT_COMMERCE_BOOTSTRAP.md)
- [Manifest Schema](./schemas/project-commerce-manifest.schema.json)
- [Training Platform Example](./examples/manifests/training-platform.yaml)
- [Telegram Fulfillment](./docs/developer/FULFILLMENT_TELEGRAM.md)

## Runtime (ARO V1 backend)

```
apps/api            Fastify API (Node 22, TypeScript, Zod, postgres.js)
infra/migrations    reviewed additive SQL over the AtlasHub data plane
infra/projects      provider + project manifests (offers, routes)
infra/docker        image + VPS compose fragment
```

Local development:

```bash
npm ci
npm run openapi:validate && npm run typecheck && npm run build
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/aro_test npm test
```

Operations: [Runtime Runbook](./docs/40_ARO_RUNTIME_RUNBOOK.md) · Data plane: [Gap Analysis](./docs/39_ARO_DATA_PLANE_GAP_ANALYSIS.md) · Pilot: [EspelhoMeu Execution](./docs/41_ESPELHOMEU_PILOT_EXECUTION.md)
