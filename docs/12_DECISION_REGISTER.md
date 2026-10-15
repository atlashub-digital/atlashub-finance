# ARO Decision Register

## ADR-001 — Name
**Decision:** Atlas Revenue Operations (ARO).

## ADR-002 — Scope
**Decision:** ARO combines Payment Orchestration, Commerce Core, Revenue CRM-lite, Finance Ops and Revenue Intelligence.

## ADR-003 — Not XPAYMENTS 2
**Decision:** ARO is not positioned as a new PSP or XPAYMENTS replacement. XPAYMENTS patterns inform design; relationship remains separately decidable.

## ADR-004 — Multi-project
**Decision:** EspelhoMeu is the first tenant. Shared commerce belongs to ARO, not the project repo.

## ADR-005 — Brazil
**Decision:** BR/BRL/PIX routes through ARO provider adapters. Initial providers: PixGo and MisticPay.

## ADR-006 — International
**Decision:** Stripe is the initial international payment adapter.

## ADR-007 — Entitlements
**Decision:** ARO owns canonical purchase-derived entitlement state/contracts; projects own fulfillment UX.

## ADR-008 — Supabase
**Decision:** AtlasHub Supabase is the data plane; projects integrate by API, not table coupling. *(The original "separate `aro` schema" wording is superseded by ADR-013: ARO reuses the existing public AtlasHub tables and adds only `aro_*` orchestration tables.)*

## ADR-009 — Hermes
**Decision:** ARO must support a future Hermes Finance/Revenue Operator with continuous analysis and policy-gated actions.

## ADR-010 — Treasury safety
**Decision:** autonomous movement of funds is out of scope for Hermes V1.

## ADR-011 — Expansion
**Decision:** multicurrency, additional providers and blockchain/stablecoin rails are architectural extension points, not launch requirements.

## ADR-012 — Fast launch
**Decision:** do not block EspelhoMeu on full ARO platform completion. Implement minimum reusable core required for real sales, then generalize from transactions.


## ADR-013 — Reuse AtlasHub data plane
**Decision:** ARO will reuse the existing AtlasHub Tenant/Project, catalog, CRM, commerce and billing substrate. New database objects are additive orchestration/finance primitives only where a verified gap exists. The draft standalone `aro.*` schema is a reference model, not an executable production migration.

## ADR-014 — Supabase migration discipline
**Decision:** no ARO DDL is applied until the existing AtlasHub schema, RLS and project/tenant mapping are reviewed and the additive gap migration is explicit.


## ADR-015 — Selective PiXBrasil reuse
**Decision:** ARO will reuse proven PiXBrasil provider/routing patterns and compatible code where valuable, but will not inherit obsolete authentication or make PiXBrasil the public ARO contract. EspelhoMeu fast launch may use pilot-local implementations while stable components are extracted after production proof.


## ADR-016 — Contract-first implementation
**Decision:** ARO implementation is governed by the versioned OpenAPI and project/agent/backend contracts committed in this repository. CODEX, Claude Code, Hermes engineering agents and human developers implement against those contracts. Hermes remains above ARO as an operator/client and is not part of payment confirmation. Project outbound webhooks are signed notifications; canonical entitlement remains resolvable from ARO. Multi-currency is native from V1 using integer minor units plus ISO-4217 currency.


## ADR-017 — Hosted checkout on a separate domain
**Status:** ACCEPTED (direction) — not implemented in V1.
**Decision:** a future ARO hosted checkout will be served from a domain separate from AtlasHub, preferably under `xpay.expert`, and not from `pay.atlashub.si` or any `atlashub.si` subdomain. The ARO API stays at `aro.atlashub.si`. Rationale and prerequisites: [Hosted Checkout](./handbook/roadmap/hosted-checkout.md).

## ADR-018 — Documentation source of truth and publication
**Status:** ACCEPTED.
**Decision:** the repository is the technical source of truth; GitBook only publishes it via Git Sync (`docs/handbook/` public handbook, `docs/` internal engineering space). Contracts are linked, never hand-copied; `npm run docs:check` guards against drift. See [Documentation & Publishing](./handbook/roadmap/documentation-publishing.md).

## ADR-019 — V1 catalog ownership
**Status:** ACCEPTED.
**Decision:** for V1, `infra/projects/<project>/aro.project.yaml` + `aro.config.json` in the ARO repository is the central catalog. Project repositories consume offer codes and entitlement keys only; distributed manifests are a post-V1 option.
