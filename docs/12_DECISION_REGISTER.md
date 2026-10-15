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
**Decision:** central AtlasHub Supabase schema `aro` is the preferred data plane; projects integrate by API, not table coupling.

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
