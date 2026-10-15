# Architecture

## Position

```
                 Atlas WorkForce / Hermes (operators, read-only V1)
                                  │
 Project frontend ──► Project backend ──► ARO API ◄── provider webhooks
                                            │
                                     Payment Router (priority + failover)
                                   ┌────────┼─────────┐
                                 PixGo  MisticPay   Stripe
                                            │
                       normalized payment → order → entitlements
                                            │
                          durable outbox → signed project webhooks
```

- **Projects** own sales pages, checkout UI, customer-facing states and fulfillment (Reader, course, community).
- **ARO** owns the catalog, routing, provider integration, payment/order state and entitlements.
- **Providers** execute the regulated payment. Their IDs are external references only.
- **Hermes** is an operator/client above ARO. Payments work when Hermes is offline.

## Runtime

| Component | Technology |
|---|---|
| API | Node.js 22, TypeScript, Fastify, Zod |
| Data plane | AtlasHub Supabase/Postgres (existing `Tenant`, `Project`, `catalog_*`, `crm_contact`, `commerce_*`, `billing_webhook_event`, plus additive `aro_*` tables) |
| Background work | in-process workers: outbox delivery (every 5 s), provider reconciler (every 60 s) |
| Deployment | Docker image behind Caddy on the AtlasHub VPS |

There is no Redis or queue infrastructure in V1; the outbox is a database table.

## Authority rules

1. **Price authority** — the project sends an offer code; amount and currency come from the ARO catalog.
2. **Payment authority** — only verified provider evidence (signed webhook, or a provider status fetch) moves a payment to `APPROVED`. A browser return URL never does.
3. **Access authority** — `POST /v1/entitlements/resolve` is the authoritative access check. Webhooks are notifications.
4. **Money** — integer minor units plus ISO-4217 currency, everywhere. No floating point, no implicit FX. Order, payment and settlement currencies are separate concepts.

## One transaction per payment transition

When provider evidence arrives, ARO atomically:

1. updates the normalized payment (attempt) state;
2. updates the order (e.g. `APPROVED`);
3. grants or revokes entitlements;
4. writes outbound events to the outbox;
5. writes an audit record.

Project webhook delivery happens after the commit, with retries. Duplicate or out-of-order provider events are harmless no-ops.

## Data plane

ARO reuses the AtlasHub schema and adds only orchestration tables (`aro_project_config`, `aro_offer`, `aro_payment_route`, `aro_checkout_session`, `aro_payment_attempt`, `aro_outbound_event`, …). It does not clone CRM, catalog or commerce. Details for engineers: `docs/39_ARO_DATA_PLANE_GAP_ANALYSIS.md` in the repository.
