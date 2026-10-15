# ARO Data Plane — Live Schema Inspection and Gap Migration (E2)

Status: **migration authored, NOT applied.** Execution requires Infrastructure review (docs/19 §V1 migration gate, ADR-014).

## 1. Inspection evidence

- Project: AtlasHub Supabase, ref `aakdyumavlzgyklbrsrw`, Postgres 17.
- Date: 2026-10-15. Method: read-only catalog queries (`information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`) plus row counts. No DDL/DML executed.
- WaaS migration head: `202610090007_workspaces_projects` (`public.waas_migrations`).
- Schemas present: `public`, `club` (Atlas Club runtime), Supabase system schemas. No `aro` schema.
- Row counts at inspection: Tenant 5 (incl. `atlashub`), **Project 0**, catalog_product 8, crm_contact 3, commerce_order 2, commerce_entitlement 2, billing_payment 0.
- RLS: enabled (not forced) on all reused tables; policies target only `waas_runtime`, driven by `waas_tenant()` / `waas_scope()` (`app.tenant_id` / `app.scope` GUCs).

The subset of live DDL ARO depends on is reproduced as a test fixture in `infra/test/atlashub_substrate.sql`; CI applies the ARO migration on top of it.

## 2. Reuse decisions

| Existing table | Fit for ARO | Decision |
|---|---|---|
| `Tenant` | ✅ | Reused as is. ARO projects live under tenant `atlashub` (to confirm, §5). |
| `Project` | ✅ identity; ❌ no keys/origins/webhook | Reused for identity. Integration config in new `aro_project_config`. `Project.slug` is only unique per tenant → ARO enforces global uniqueness on `aro_project_config.slug`. |
| `catalog_product` | ⚠️ `kind` check lacks a consumer good | Reused. Check **widened** with `digital_good`. |
| `catalog_price` | ✅ amountMinor, currency (BRL/EUR/USD), market, status | Reused as the single price source. Offers point at a price. |
| `crm_contact` | ✅ unique `(tenantId, emailNorm)` | Reused as customer identity. `customer_id` in the API = `crm_contact.id`. |
| `crm_lead` / `crm_consent` | ⚠️ B2B pipeline / requires consent text versioning | Not written in V1. Attribution snapshot stored on the checkout session (CRM-lite: source/UTM). |
| `commerce_order` | ⚠️ no project/contact link, no refund/chargeback status | Reused. Nullable `projectId`, `contactId`, `approvedAt` added; status check **widened** with `refunded`, `chargeback`. |
| `commerce_quote_line` | ❌ quote-bound | Not reused. New `aro_order_item`. |
| `commerce_entitlement` | ✅ unique `(tenantId, key, source, sourceId)` = idempotent grant | Reused. Nullable `projectId`, `contactId`, `revokedAt` added. |
| `billing_webhook_event` | ✅ provider inbox with `UNIQUE(provider, eventId)` | Reused as provider inbox. Nullable `trustLevel`, `projectId`, `paymentAttemptId`, `normalizedType` added. |
| `billing_payment` | ❌ `invoiceId NOT NULL` → billing_invoice → billing_account (B2B invoicing); provider check excludes pixgo/misticpay | **Not written in V1.** Normalized consumer payments live in `aro_payment_attempt`. Converging them into billing_payment needs a separate decision (nullable invoiceId + provider list). |
| `AuditEvent` | ✅ (tenantId, actorId, action, objectId) | Reused for ARO audit records. |

## 3. Additive gap (migration `infra/migrations/202610150001_aro_v1_additive.sql`)

New tables (13, all RLS-enabled, policy only for `aro_runtime`):

| Table | Purpose |
|---|---|
| `aro_project_config` | slug, allowed origins, outbound webhook URL + secret ref, default market/currency |
| `aro_api_key` | public / server project keys (SHA-256 hash only, rotatable) |
| `aro_offer` | project offer code → `catalog_price`, products, cadence, payment methods, entitlement keys |
| `aro_catalog_revision` | every synced `aro.project.yaml`, verbatim (versioning + audit) |
| `aro_fulfillment_rule` | entitlement → fulfillment action mapping (informational, not payment authority) |
| `aro_provider_account` | provider, environment, `credentialRef` (never a secret) |
| `aro_payment_route` | PRIORITY_FAILOVER routing rows |
| `aro_checkout_session` | public checkout lifecycle, idempotency, attribution snapshot, payment instruction |
| `aro_order_item` | order lines |
| `aro_payment_attempt` | provider attempts = normalized payments (state, provider ref, fee/net) |
| `aro_refund` | refund / chargeback record |
| `aro_outbound_event` | durable outbox (exact signed body, dedupe key) |
| `aro_webhook_delivery` | at-least-once delivery state per event/endpoint |

Deferred (not needed before E7): ledger, settlement, reconciliation exception, provider health.

Changes to existing tables are limited to nullable columns, new indexes, new FKs on new columns, and two widened CHECK constraints. Every existing row remains valid; existing `waas_runtime` policies are untouched.

## 4. Runtime access

- New NOLOGIN role `aro_runtime`. Infrastructure creates a LOGIN user in it; its password is provisioned out of band.
- ARO enforces project scope in the application (API key → project). The `aro_runtime_access` policies are therefore `USING (true)` for that role only.
- Grants are minimal: read-only on Tenant/Project/catalog; insert on crm_contact; insert/update on commerce_order, commerce_entitlement, billing_webhook_event; insert on AuditEvent.

## 5. Decisions needed before applying

1. **Tenant mapping**: register `espelhomeu`, `levelab`, `atlas-club` as `Project` rows under tenant `atlashub` (recommended), or under dedicated tenants.
2. Confirm widening `catalog_product.kind` and `commerce_order.status` is acceptable for WaaS code paths (no WaaS row will ever carry the new values).
3. Run Supabase security/performance advisors after apply (docs/19).

## 6. Apply / rollback (Infrastructure)

Apply (after review, on controlled scope):

```bash
DATABASE_URL=<owner DSN> node dist/migrate-cli.js   # in the aro-api image: ARO_MIGRATIONS_DIR=/app/migrations
```

Rollback (no ARO production data yet): `infra/migrations/rollback/202610150001_aro_v1_additive.down.sql`. Once real orders exist, rollback means disabling routes/project config, not dropping tables.
