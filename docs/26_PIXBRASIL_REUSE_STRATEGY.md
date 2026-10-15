# PiXBrasil Reuse Strategy

## Context

The existing repository `nexflowx-hub/pixbrasil-platform` contains mature PIX orchestration patterns that materially reduce ARO implementation risk.

Verified reusable components include:

- provider adapter contract;
- PixGo adapter;
- MisticPay adapter;
- provider adapter registry;
- routing engine;
- priority failover;
- weighted/volume/health/cost-aware strategies;
- provider health model;
- ambiguous create handling;
- PixGo recovery by external reference;
- webhook verification model;
- Vault/provider-account separation;
- persisted routing decision evidence.

## Decision

ARO should **reuse/extract patterns and compatible implementation**, not blindly fork PiXBrasil and not make PiXBrasil the conceptual owner of ARO.

ARO has a broader responsibility:
- commerce;
- revenue CRM-lite;
- entitlements;
- finance ops;
- revenue intelligence;
- Workforce/Hermes operation.

PiXBrasil remains valuable payment-domain implementation history and potentially a transitional execution service.

## Especially reusable

### Provider contract

The existing concepts are retained in ARO:

- capabilities
- create outcome
- recovery outcome
- normalized status
- health result
- createCharge
- recoverCreate
- getCharge
- verifyWebhook
- mapProviderStatus
- healthCheck

### Create outcomes

A crucial pattern:

```
CREATED
REJECTED
UNAVAILABLE
AMBIGUOUS
```

Network timeout after a create request is not automatically FAILED.

AMBIGUOUS means:
- recover first;
- reconcile;
- do not blindly create a second payable PIX.

### Routing

The existing routing strategies are valid ARO extension points:

- PRIORITY_FAILOVER
- WEIGHTED
- VOLUME_SPLIT
- HEALTH_AWARE
- COST_AWARE
- RULES

ARO V1 may start with PRIORITY_FAILOVER, but the data model should not block the other strategies.

## Provider-specific reuse rules

### PixGo

Strong candidate for direct extraction:
- X-API-Key
- external_id recovery
- signed webhook
- status verification
- health probe

### MisticPay

Reuse:
- Basic auth structure
- create/status contract
- verify-by-fetch webhook trust
- health/adapter patterns

Do **not** copy legacy `ci/cs` support into new ARO implementation. New integration uses current `pk_/sk_` access keys with scoped permissions.

Also normalize documented monetary units carefully because create response and check/webhook examples use different representations.

## Existing XPayments/PiXBrasil data plane

The connected financial Supabase already contains substantial payment infrastructure:

- provider_accounts
- provider_connections
- provider_event_inbox
- provider_payment_observations
- checkout_sessions
- gateway_vaults
- routing_policies
- routing_decisions
- provider_health_snapshots
- treasury structures

This is valuable operational history and can inform or feed ARO.

It does not automatically mean ARO should bind its public contracts directly to the XPAYMENTS schema.

## Transitional options

### Option A — Extract code into ARO
Preferred long-term:
- ARO owns canonical adapter/routing packages;
- projects consume ARO API.

### Option B — Use PiXBrasil as transitional PIX execution backend
Useful only if:
- current runtime health is verified;
- merchant/project credentials are safely provisioned;
- S2S contract is confirmed;
- response/webhook mapping is normalized by ARO.

Projects still call ARO, not PiXBrasil directly.

## EspelhoMeu fast launch

Do not delay the launch for a full extraction.

The PR #30 pilot should incorporate the safety patterns required for money:
- no blind retry after ambiguous create;
- PixGo recovery by external_id;
- MisticPay no automatic failover after ambiguous create;
- verified webhook/status before grant;
- idempotent entitlement.

After the first production proof, move the stable provider/routing logic into ARO canonical packages/API.

## Principle

Reuse the proven financial behavior.

Do not inherit obsolete authentication, accidental coupling or legacy product boundaries.
