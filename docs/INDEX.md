# ARO Engineering Documentation (internal)

Internal architecture, contracts, data plane and operations for **ARO — Atlas Revenue Operations**.

- **Project developers and partners:** use the [ARO Developer Handbook](./handbook/README.md) (publishable GitBook space).
- **API contract:** [`openapi/aro-v1.yaml`](../openapi/aro-v1.yaml). **Manifest schema:** [`schemas/project-commerce-manifest.schema.json`](../schemas/project-commerce-manifest.schema.json).

## Source-of-truth order

1. Runtime contracts: OpenAPI, manifest schema, migrations, code.
2. Decision register (ADRs).
3. Handbook (behavioral rules for integrators) and the canonical docs below.
4. Background/strategy documents.
5. Chat instructions never override 1–4 without a repository change.

## V1 baseline (implemented)

| Area | Document |
|---|---|
| Execution status | [Execution Board](./38_EXECUTION_BOARD.md) |
| Backend spec | [Backend Implementation Specification V1](./37_BACKEND_IMPLEMENTATION_SPEC_V1.md) |
| Data plane | [Data Plane Gap Analysis (E2)](./39_ARO_DATA_PLANE_GAP_ANALYSIS.md), [AtlasHub Supabase Alignment](./19_ATLASHUB_SUPABASE_ALIGNMENT.md) |
| Operations | [Runtime Runbook (E6)](./40_ARO_RUNTIME_RUNBOOK.md) |
| Pilot | [EspelhoMeu Pilot Execution (E7)](./41_ESPELHOMEU_PILOT_EXECUTION.md) |
| Provider adapters | [Adapter Contract](./03_PROVIDER_ADAPTER_CONTRACT.md), [PixGo](./providers/PIXGO.md), [MisticPay](./providers/MISTICPAY.md), [Stripe](./providers/STRIPE.md), [Adapter Template](./providers/ADAPTER_TEMPLATE.md), [Provider Onboarding](./17_PROVIDER_ONBOARDING_CHECKLIST.md) |
| Contracts | [Project Integration Contract V1](./35_PROJECT_INTEGRATION_CONTRACT_V1.md), [Hermes Tool Contract V1](./36_HERMES_TOOL_CONTRACT_V1.md), [ADR-016](./ADR-016_CONTRACT_FIRST_IMPLEMENTATION.md) |
| Decisions | [Decision Register](./12_DECISION_REGISTER.md) |

## Foundation

[Master Blueprint](./MASTER_BLUEPRINT.md) · [Vision & Scope](./00_VISION_AND_SCOPE.md) · [Architecture V1](./ARO_ARCHITECTURE_V1.md) · [Domain Model](./02_DOMAIN_MODEL.md) · [Routing Engine](./04_ROUTING_ENGINE.md) · [Commerce & Checkout](./05_COMMERCE_CHECKOUT.md) · [Security & Governance](./09_SECURITY_GOVERNANCE.md) · [Glossary](./18_GLOSSARY.md)

## Operations & quality

[Operations Runbook (target model)](./10_OPERATIONS_RUNBOOK.md) · [Testing & Release Gates](./21_TESTING_AND_RELEASE_GATES.md) · [Observability & SLOs](./22_OBSERVABILITY_AND_SLOS.md) · [Data Retention & Privacy](./23_DATA_RETENTION_PRIVACY.md) · [Versioning & Change Management](./24_VERSIONING_CHANGE_MANAGEMENT.md) · [Engineering Principles](./31_ENGINEERING_PRINCIPLES.md) · [Repository Standard](./32_REPOSITORY_STANDARD.md)

## Future scope (not V1)

[Finance Ledger & Reconciliation](./06_FINANCE_LEDGER_RECONCILIATION.md) · [Revenue CRM & Intelligence](./07_REVENUE_CRM_INTELLIGENCE.md) · [Hermes Finance Operator](./08_HERMES_FINANCE_OPERATOR.md) · [Roadmap](./11_ROADMAP.md) · [Atlas Workforce Revenue Module](./16_ATLAS_WORKFORCE_REVENUE_MODULE.md) · [LEGO Component Map](./25_LEGO_COMPONENT_MAP.md) · [PiXBrasil Reuse Strategy](./26_PIXBRASIL_REUSE_STRATEGY.md) · [Agentic Operating Model](./27_AGENTIC_OPERATING_MODEL.md) · [Market & Currency Intelligence](./28_MARKET_CURRENCY_INTELLIGENCE.md) · [Future Rails — Blockchain](./29_FUTURE_RAILS_BLOCKCHAIN.md) · [WorkForce Finance Agent UX](./30_WORKFORCE_FINANCE_AGENT_UX.md) · [Component Contract Catalog](./33_COMPONENT_CONTRACT_CATALOG.md) · [Hosted Checkout (planned)](./handbook/roadmap/hosted-checkout.md)

## Superseded (kept for history)

[API Contracts V1 draft](./15_API_CONTRACTS_V1.md) · [Supabase Schema V1 draft](./14_SUPABASE_SCHEMA_V1.sql) · [Integration Playbook](./20_INTEGRATION_PLAYBOOK.md) · [Project Onboarding Runbook](./34_PROJECT_ONBOARDING_RUNBOOK.md) · [ESPELHOMEU Pilot (intent)](./13_ESPELHOMEU_PILOT.md)

## Documentation rule

Architecture, contracts, provider assumptions, operating procedures and product decisions are committed here before they become runtime behavior. See ADR-018 and [Documentation & Publishing](./handbook/roadmap/documentation-publishing.md).
