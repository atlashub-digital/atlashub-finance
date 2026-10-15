# ARO V1 — Execution Board

> **Status (2026-10-15):** E1–E5 and catalog sync accepted; E6 deployed by Infrastructure (pooler hotfix `prepare: false`); E7 EspelhoMeu real PIX proof next; E8 reuse proven in tests (LeveLab price pending). Integrator documentation: [ARO Developer Handbook](./handbook/README.md).

## Now

### E1 — Bootstrap API
Owner: Engineering
Exit:
- Fastify API boots;
- `GET /health`;
- env validation;
- Docker image;
- CI green.

### E2 — AtlasHub data plane
Owner: Engineering + Helena review
Exit:
- live schema inspected;
- additive migration authored;
- no duplicate CRM/catalog/commerce;
- migration reviewed before execution.

### E3 — PIX path
Owner: Engineering
Exit:
- PixGo adapter;
- create/status/webhook;
- normalized states;
- idempotency;
- ambiguous-create recovery.

### E4 — Commerce authority
Owner: Engineering
Exit:
- checkout session;
- order/order items;
- payment attempt/payment;
- entitlement grant/revoke.

### E5 — Project events
Owner: Engineering
Exit:
- durable outbox;
- HMAC-signed webhook;
- at-least-once delivery;
- retry/dedupe.

### E6 — VPS
Owner: Helena
Exit:
- `aro-api` deployed;
- Caddy/domain;
- secrets provisioned;
- DB reachable;
- health PASS;
- rollback documented.

### E7 — EspelhoMeu proof
Owners: Engineering + Helena
Exit:
- P01 R$11.90;
- PIX created;
- paid;
- APPROVED;
- entitlement active;
- Reader opens;
- refund/revoke;
- duplicate events safe.

### E8 — Reuse
Owner: Engineering
Exit:
- LeveLab offer configured;
- Atlas Club offer configured;
- no provider-specific code in either project.

## Stop conditions

Do not spend time before E7 on:
- dashboard polish;
- Hermes full runtime;
- AI routing;
- blockchain;
- advanced finance BI.
