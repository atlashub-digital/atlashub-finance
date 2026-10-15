# CLAUDE.md — ARO V1 Engineering Mission

## Mission

Implement **ARO V1 — Atlas Revenue Operations** in this repository.

Do not redesign the architecture. The Foundation V1 on `main` is canonical.

Execution issue:
- GitHub Issue #12 — ARO V1 — Contract-first backend implementation

Working branch:
- `feat/aro-v1-backend`

## Read first

Before changing code, read:

1. `README.md`
2. `docs/MASTER_BLUEPRINT.md`
3. `docs/ARO_ARCHITECTURE_V1.md`
4. `docs/19_ATLASHUB_SUPABASE_ALIGNMENT.md`
5. `docs/35_PROJECT_INTEGRATION_CONTRACT_V1.md`
6. `docs/36_HERMES_TOOL_CONTRACT_V1.md`
7. `docs/37_BACKEND_IMPLEMENTATION_SPEC_V1.md`
8. `openapi/aro-v1.yaml`
9. `docs/providers/PIXGO.md`
10. `docs/providers/MISTICPAY.md`
11. `docs/providers/STRIPE.md`
12. `docs/12_DECISION_REGISTER.md`

Chat messages are not source of truth when they conflict with repository contracts.

## Role split

### Claude Code / Engineering
Own:
- application code;
- API;
- provider adapters;
- migrations as reviewed files;
- automated tests;
- Docker artifacts;
- CI;
- documentation updates required by implementation.

### Helena / Infrastructure
Own:
- VPS runtime;
- secrets provisioning;
- Docker/Caddy deployment;
- database migration execution after review;
- health/smoke;
- rollback;
- operational evidence.

Do not require Helena to write application code.

## V1 target

The first real proof is:

```
EspelhoMeu P01
→ ARO checkout
→ BR / BRL / PIX
→ PixGo
→ payment APPROVED
→ order APPROVED
→ entitlement espelhomeu:p01 ACTIVE
→ EspelhoMeu Reader unlock
```

Then prove the same API can register/use:
- one LeveLab offer;
- one Atlas Club offer;

without provider-specific code in those project repos.

## Architecture

```
Project frontend/backend
        ↓
      ARO API
        ↓
 Payment Router
   ↙    ↓    ↘
PixGo MisticPay Stripe
        ↓
Normalized Payment
        ↓
Order
        ↓
Entitlement
        ↓
Project fulfillment
```

Hermes is above ARO as an operator/client.

Payments must work when Hermes is offline.

## Stack

Preferred:
- Node.js 22+
- TypeScript
- Fastify
- Zod
- Drizzle
- AtlasHub Supabase/Postgres
- Docker

Do not add Redis or other infrastructure unless a concrete requirement justifies it.

## Repository layout target

```
apps/
  api/
    src/
      app.ts
      env.ts
      routes/
      modules/
        checkout/
        orders/
        payments/
        entitlements/
        projects/
        operator/
      providers/
        pixgo/
        misticpay/
        stripe/
      security/
      audit/
packages/
  contracts/
  client/
infra/
  docker/
  migrations/
openapi/
docs/
```

## Implementation order

### Milestone A — runnable core
- bootstrap workspace;
- `GET /health`;
- env validation;
- structured logging;
- Dockerfile / compose fragment;
- CI.

### Milestone B — data plane
- inspect live AtlasHub Supabase schema;
- derive additive migration only;
- do NOT apply `docs/14_SUPABASE_SCHEMA_V1.sql` blindly;
- project/tenant linkage;
- provider accounts/routes;
- checkout sessions;
- payment attempts;
- outbound event/delivery tables.

### Milestone C — commerce
- offers resolution;
- create checkout;
- order + items;
- idempotency;
- normalized states.

### Milestone D — providers
- PixGo first;
- MisticPay fallback;
- Stripe international;
- provider adapter contract;
- webhook verification/verify-by-fetch rules;
- ambiguous create recovery.

### Milestone E — entitlements + outbound webhook
- grant/revoke;
- `POST /v1/entitlements/resolve`;
- durable outbox;
- HMAC-signed project webhook;
- retry + dedupe.

### Milestone F — pilot
- EspelhoMeu P01;
- real low-value PIX;
- APPROVED;
- entitlement;
- Reader unlock;
- refund/revoke;
- duplicate webhook test.

### Milestone G — reuse proof
- LeveLab offer;
- Atlas Club offer;
- same API, no provider code.

## API contract

The OpenAPI file is canonical:
- `openapi/aro-v1.yaml`

Do not silently change paths, headers, states or event names.

If implementation requires a contract change:
1. update OpenAPI;
2. update integration docs;
3. explain rationale in PR;
4. preserve backward compatibility where possible.

## Security

Never commit:
- provider secrets;
- project server keys;
- webhook secrets;
- service-role keys;
- production DSNs.

Never expose provider credentials to project applications.

Use:
- public project checkout key;
- project server key;
- checkout secret;
- operator token.

## Money

Always:
- integer minor units;
- ISO-4217 currency;
- no floating-point amounts;
- no implicit FX.

Order currency, payment currency and settlement currency are separate concepts.

## Database rule

Reuse AtlasHub existing:
- Tenant / Project;
- catalog_*;
- crm_*;
- commerce_*;
- billing_*;

and add only verified gaps.

No parallel full CRM/catalog/commerce clone.

## CRM-lite

V1 only:
- contact identity;
- source/UTM;
- purchase history;
- active entitlements.

Do not build a Salesforce-like CRM.

## Hermes

Do not put Hermes in the payment path.

Expose operator/read tooling later according to:
- `docs/36_HERMES_TOOL_CONTRACT_V1.md`

Phase 0 direct Telegram/Discord notifications remain independent of LLM availability.

## Definition of done

ARO V1 is not “done” because code compiles.

Required:
- CI green;
- runtime healthy;
- migration reviewed/applied;
- real controlled PixGo payment PASS;
- order APPROVED;
- entitlement ACTIVE;
- Reader unlock;
- duplicate webhook harmless;
- refund/revoke PASS;
- signed project webhook PASS;
- Levelab reuse proof;
- Atlas Club reuse proof;
- rollback documented;
- Helena operational smoke PASS.

## Engineering style

Prefer small, reviewable commits.

Do not create speculative abstractions.

Implement the smallest reusable core that satisfies the contracts.
