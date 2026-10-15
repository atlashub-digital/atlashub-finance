# ARO Backend Implementation Specification V1

## Objective

Implement the smallest reusable ARO backend that can serve EspelhoMeu, LeveLab and Atlas Club without creating a payment backend per project.

## Runtime

Recommended:
- Node.js 22+
- TypeScript
- Fastify
- Zod
- Drizzle
- existing AtlasHub Supabase/Postgres
- Docker
- Caddy / AtlasHub edge
- optional Redis only when justified by delivery/queue load

Do not add infrastructure merely because it may be useful later.

## Repository

Canonical repository:

`atlashub-digital/atlashub-finance`

Suggested runtime layout:

```
apps/
  api/
    src/
      app.ts
      env.ts
      routes/
      modules/
        projects/
        catalog/
        checkout/
        orders/
        payments/
        entitlements/
        webhooks/
        operator/
      providers/
        pixgo/
        misticpay/
        stripe/
      security/
      audit/
packages/
  contracts/
    openapi/
    types/
  client/
    js/
infra/
  docker/
  migrations/
docs/
openapi/
  aro-v1.yaml
```

## Database strategy

Do not apply docs/14_SUPABASE_SCHEMA_V1.sql as-is.

Production must follow docs/19_ATLASHUB_SUPABASE_ALIGNMENT.md.

Reuse existing AtlasHub:
- Tenant / Project;
- catalog_product / catalog_price;
- crm_contact / crm_lead / crm_consent / crm_activity;
- commerce_order / commerce_subscription / commerce_entitlement;
- billing_payment / billing_webhook_event;

and add only missing orchestration primitives.

## Minimum additive tables

Subject to verified live schema review:

- aro_provider_account
- aro_payment_route
- aro_checkout_session
- aro_payment_attempt
- aro_refund
- aro_outbound_event
- aro_webhook_delivery
- aro_provider_health

Potential later:
- aro_ledger_entry
- aro_settlement
- aro_reconciliation_exception

## Auth model

### Public checkout key

Project scoped.

Allowed only:
- create checkout;
- no operator data;
- no arbitrary project override;
- origin allowlist;
- rate limited.

### Server key

Project scoped.

Allowed:
- order read;
- entitlement resolve;
- server integration.

### Operator token

Human/Hermes Atlas WorkForce identity.

Scoped by:
- tenant;
- project;
- role;
- action class.

## Idempotency

Required on every state-creating endpoint.

Create checkout:
```
project + Idempotency-Key
```

Provider payment create:
```
project + order + attempt_number
```

Provider event:
```
provider + provider_event_id
```

Outbound project delivery:
```
event_id + endpoint
```

## State authority

Projects never mark:
- payment approved;
- order approved;
- entitlement active;

based on browser return state.

ARO grants commercial state only from verified provider evidence.

## Provider trust

Adapter declares one:

- SIGNED
- VERIFIED_BY_FETCH
- UNTRUSTED

UNTRUSTED events never grant monetary state automatically.

## Transaction boundary

Payment approval processing should atomically or safely idempotently achieve:

1. normalized payment APPROVED;
2. order APPROVED when business rules satisfied;
3. entitlement(s) granted;
4. outbound event enqueued;
5. audit record stored.

Notification delivery occurs after durable commit.

## Outbound event architecture

Use a durable outbox.

Do not call project webhook inside the same database transaction.

```
payment transition
→ DB commit
→ aro_outbound_event
→ delivery worker
→ signed project webhook
→ retry
```

## Retry

Outbound webhook:
- exponential backoff;
- bounded retries;
- dead-letter/exception after policy threshold;
- manually replayable.

Provider ambiguous create:
- do not blindly retry;
- recover by idempotency key/provider lookup;
- only then fail over.

## Multi-currency rules

- all money is integer minor units;
- currency required on every amount;
- no implicit FX;
- original currency immutable;
- settlement currency separate;
- reference reporting conversion separate;
- provider FX evidence retained.

## MVP provider routing

```
BR + BRL + PIX
→ PixGo priority 10
→ MisticPay priority 20

INTL + CARD
→ Stripe priority 10
```

V1 router is priority/failover, not AI.

## CRM-lite

Reuse AtlasHub CRM substrate.

Required V1 integration:
- create/update contact from checkout identity according to consent policy;
- preserve source/UTM;
- associate contact with checkout/order;
- expose purchase history and active entitlements.

Do not build a general sales pipeline CRM.

## Hermes

Hermes is an ARO client/operator.

Do not implement Hermes inside payment modules.

First deliver:
- operator read endpoints;
- normalized events;
- approval records;
- audit.

Hermes runtime may be deployed separately and can be unavailable without affecting payments.

## MVP acceptance

ARO V1 is functional when all pass:

### EspelhoMeu
- P01 checkout via ARO;
- PixGo PIX created;
- QR payload rendered;
- payment confirmed;
- payment/order APPROVED;
- entitlement espelhomeu:p01 ACTIVE;
- Reader unlocks;
- duplicate webhook harmless;
- refund/revoke path tested.

### Reuse
- Levelab can register one offer without provider code;
- Atlas Club can register one offer without provider code;
- both call same ARO API contract.

### Operations
- Telegram/Discord notification may be emitted;
- ARO health visible;
- provider failure does not corrupt order;
- logs contain no provider secrets or payer document.

## Explicitly not required before V1

- full Atlas WorkForce dashboard;
- full Hermes autonomy;
- advanced BI;
- automatic routing by AI;
- blockchain;
- treasury;
- full settlement ledger;
- all currencies/providers.
