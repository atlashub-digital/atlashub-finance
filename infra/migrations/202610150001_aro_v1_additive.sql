-- ARO V1 — additive gap migration over the live AtlasHub substrate.
--
-- STATUS: AUTHORED, NOT APPLIED. Requires Infrastructure (Helena) review
-- before execution, per docs/19 "V1 migration gate" and ADR-014.
--
-- Derived from a read-only inspection of AtlasHub (ref aakdyumavlzgyklbrsrw)
-- on 2026-10-15; see docs/39_ARO_DATA_PLANE_GAP_ANALYSIS.md for the evidence
-- and the reasoning behind each statement below.
--
-- Rules followed:
--   * reuse Tenant / Project / catalog_* / crm_* / commerce_* / billing_*;
--   * existing tables only receive NULLABLE columns, new indexes, or a
--     WIDENED check constraint (strictly more values allowed) — no column
--     drops, no type changes, no NOT NULL on existing columns, no data rewrite;
--   * new tables are prefixed aro_ and have RLS enabled with policies only for
--     the aro_runtime role, so they are never exposed through PostgREST to
--     anon/authenticated;
--   * money = bigint minor units + ISO-4217 currency column, always together.
--
-- Idempotent where Postgres allows (IF NOT EXISTS); wrapped in one transaction
-- by the runner (apps/api/src/db/migrate.ts).

-- ---------------------------------------------------------------------------
-- 0. Runtime role
-- ---------------------------------------------------------------------------
-- NOLOGIN group role. Infrastructure creates the LOGIN user that is a member
-- of it and provisions the password out of band (never in git).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aro_runtime') THEN
    CREATE ROLE aro_runtime NOLOGIN;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Additive columns on reused AtlasHub tables
-- ---------------------------------------------------------------------------

-- 1.1 catalog_product: kind check has no consumer digital-good value.
-- Widening only: every existing row stays valid.
ALTER TABLE catalog_product DROP CONSTRAINT IF EXISTS catalog_product_kind_check;
ALTER TABLE catalog_product ADD CONSTRAINT catalog_product_kind_check
  CHECK (kind = ANY (ARRAY['mission','subscription','addon','setup','credit_pack','digital_good']));

-- 1.2 commerce_order: project + customer linkage, approval time, reversal states.
ALTER TABLE commerce_order ADD COLUMN IF NOT EXISTS "projectId" text;
ALTER TABLE commerce_order ADD COLUMN IF NOT EXISTS "contactId" text;
ALTER TABLE commerce_order ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_order_project_fkey') THEN
    ALTER TABLE commerce_order ADD CONSTRAINT commerce_order_project_fkey
      FOREIGN KEY ("tenantId", "projectId") REFERENCES "Project"("tenantId", id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_order_contact_fkey') THEN
    ALTER TABLE commerce_order ADD CONSTRAINT commerce_order_contact_fkey
      FOREIGN KEY ("tenantId", "contactId") REFERENCES crm_contact("tenantId", id);
  END IF;
END $$;
ALTER TABLE commerce_order DROP CONSTRAINT IF EXISTS commerce_order_status_check;
ALTER TABLE commerce_order ADD CONSTRAINT commerce_order_status_check
  CHECK (status = ANY (ARRAY['pending_payment','paid','fulfilling','fulfilled','cancelled','refunded','chargeback']));
CREATE INDEX IF NOT EXISTS commerce_order_project_idx
  ON commerce_order ("projectId", "createdAt") WHERE "projectId" IS NOT NULL;

-- 1.3 commerce_entitlement: project + customer linkage for /v1/entitlements/resolve.
-- Grant idempotency reuses the existing UNIQUE (tenantId, key, source, sourceId)
-- with source = 'order', sourceId = order id.
ALTER TABLE commerce_entitlement ADD COLUMN IF NOT EXISTS "projectId" text;
ALTER TABLE commerce_entitlement ADD COLUMN IF NOT EXISTS "contactId" text;
ALTER TABLE commerce_entitlement ADD COLUMN IF NOT EXISTS "revokedAt" timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_entitlement_project_fkey') THEN
    ALTER TABLE commerce_entitlement ADD CONSTRAINT commerce_entitlement_project_fkey
      FOREIGN KEY ("tenantId", "projectId") REFERENCES "Project"("tenantId", id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_entitlement_contact_fkey') THEN
    ALTER TABLE commerce_entitlement ADD CONSTRAINT commerce_entitlement_contact_fkey
      FOREIGN KEY ("tenantId", "contactId") REFERENCES crm_contact("tenantId", id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS commerce_entitlement_resolve_idx
  ON commerce_entitlement ("projectId", "contactId", status) WHERE "projectId" IS NOT NULL;

-- 1.4 billing_webhook_event: reused as the shared provider inbox.
ALTER TABLE billing_webhook_event ADD COLUMN IF NOT EXISTS "trustLevel" text;
ALTER TABLE billing_webhook_event ADD COLUMN IF NOT EXISTS "projectId" text;
ALTER TABLE billing_webhook_event ADD COLUMN IF NOT EXISTS "paymentAttemptId" text;
ALTER TABLE billing_webhook_event ADD COLUMN IF NOT EXISTS "normalizedType" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_webhook_event_trust_check') THEN
    ALTER TABLE billing_webhook_event ADD CONSTRAINT billing_webhook_event_trust_check
      CHECK ("trustLevel" IS NULL OR "trustLevel" = ANY (ARRAY['SIGNED','VERIFIED_BY_FETCH','UNTRUSTED']));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. New ARO orchestration tables
-- ---------------------------------------------------------------------------

-- 2.1 Per-project ARO configuration (Project has no commerce/integration fields).
CREATE TABLE IF NOT EXISTS aro_project_config (
  "projectId"        text PRIMARY KEY,
  "tenantId"         text NOT NULL,
  slug               text NOT NULL,
  "allowedOrigins"   text[] NOT NULL DEFAULT '{}',
  "webhookUrl"       text,
  "webhookSecretRef" text,
  "defaultMarket"    text NOT NULL DEFAULT 'BR',
  "defaultCurrency"  text NOT NULL DEFAULT 'BRL' CHECK ("defaultCurrency" ~ '^[A-Z]{3}$'),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  -- ARO addresses projects by slug in its public contract; Project.slug is only
  -- unique per tenant, so ARO-enabled slugs must be globally unique.
  CONSTRAINT aro_project_config_slug_key UNIQUE (slug),
  CONSTRAINT aro_project_config_project_fkey
    FOREIGN KEY ("tenantId", "projectId") REFERENCES "Project"("tenantId", id),
  CONSTRAINT aro_project_config_webhook_check
    CHECK (("webhookUrl" IS NULL) = ("webhookSecretRef" IS NULL))
);

-- 2.2 Project API keys (public checkout key / server key). Only SHA-256 hashes
-- are stored; the plaintext is shown once at issuance.
CREATE TABLE IF NOT EXISTS aro_api_key (
  id           text PRIMARY KEY,
  "projectId"  text NOT NULL REFERENCES aro_project_config("projectId"),
  kind         text NOT NULL CHECK (kind IN ('public','server')),
  "keyHash"    text NOT NULL,
  "keyPrefix"  text NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "revokedAt"  timestamptz,
  CONSTRAINT aro_api_key_hash_key UNIQUE ("keyHash")
);

-- 2.3 Offers: project-scoped commercial handle (e.g. "p01-br") over a
-- catalog_price, plus the entitlement keys it grants. Amount and currency are
-- read from catalog_price — single price source of truth.
CREATE TABLE IF NOT EXISTS aro_offer (
  id                 text PRIMARY KEY,
  "tenantId"         text NOT NULL,
  "projectId"        text NOT NULL REFERENCES aro_project_config("projectId"),
  slug               text NOT NULL,
  "priceId"          text NOT NULL REFERENCES catalog_price(id),
  title              text NOT NULL,
  "entitlementKeys"  text[] NOT NULL DEFAULT '{}',
  -- Catalog-first manifest fields (schemas/project-commerce-manifest.schema.json).
  "productIds"       text[] NOT NULL DEFAULT '{}',
  cadence            text NOT NULL DEFAULT 'once' CHECK (cadence IN ('once','month','year')),
  "paymentMethods"   text[] NOT NULL DEFAULT '{}',   -- empty = any routed method
  metadata           jsonb NOT NULL DEFAULT '{}',
  "catalogRevisionId" text,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aro_offer_project_slug_key UNIQUE ("projectId", slug)
);

-- 2.3b Catalog revisions: every synced aro.project.yaml, verbatim, for
-- versioning and audit of product/offer/entitlement/fulfillment mappings.
CREATE TABLE IF NOT EXISTS aro_catalog_revision (
  id                text PRIMARY KEY,
  "tenantId"        text NOT NULL,
  "projectId"       text NOT NULL REFERENCES aro_project_config("projectId"),
  "manifestSha256"  text NOT NULL,
  manifest          jsonb NOT NULL,
  "appliedBy"       text NOT NULL,
  "appliedAt"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aro_catalog_revision_project_idx ON aro_catalog_revision ("projectId", "appliedAt");

-- 2.3c Fulfillment mapping (entitlement → action). Informational for project
-- automations; never part of payment authority.
CREATE TABLE IF NOT EXISTS aro_fulfillment_rule (
  id                   text PRIMARY KEY,
  "projectId"          text NOT NULL REFERENCES aro_project_config("projectId"),
  "entitlementKey"     text NOT NULL,
  type                 text NOT NULL CHECK (type IN ('web_access','telegram','whatsapp','download','external','none')),
  target               text,
  metadata             jsonb NOT NULL DEFAULT '{}',
  "catalogRevisionId"  text NOT NULL REFERENCES aro_catalog_revision(id)
);
CREATE INDEX IF NOT EXISTS aro_fulfillment_rule_project_idx ON aro_fulfillment_rule ("projectId", "entitlementKey");

-- 2.4 Provider accounts. credentialRef points to the secret store; never a secret.
CREATE TABLE IF NOT EXISTS aro_provider_account (
  id               text PRIMARY KEY,
  "tenantId"       text NOT NULL REFERENCES "Tenant"(id),
  provider         text NOT NULL CHECK (provider IN ('pixgo','misticpay','stripe')),
  environment      text NOT NULL DEFAULT 'production' CHECK (environment IN ('production','test')),
  "credentialRef"  text NOT NULL,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','degraded','disabled')),
  "createdAt"      timestamptz NOT NULL DEFAULT now()
);

-- 2.5 Routes: PRIORITY_FAILOVER. projectId NULL = tenant-wide default.
CREATE TABLE IF NOT EXISTS aro_payment_route (
  id                   text PRIMARY KEY,
  "tenantId"           text NOT NULL REFERENCES "Tenant"(id),
  "projectId"          text REFERENCES aro_project_config("projectId"),
  market               text NOT NULL,          -- e.g. BR, EU, US, INTL, or '*'
  currency             text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  method               text NOT NULL CHECK (method IN ('PIX','CARD')),
  "providerAccountId"  text NOT NULL REFERENCES aro_provider_account(id),
  priority             integer NOT NULL,
  "ruleVersion"        integer NOT NULL DEFAULT 1,
  "effectiveAt"        timestamptz NOT NULL DEFAULT now(),
  active               boolean NOT NULL DEFAULT true,
  "createdAt"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aro_payment_route_lookup_idx
  ON aro_payment_route ("tenantId", currency, method, priority) WHERE active;

-- 2.6 Checkout sessions. The payer document (CPF/CNPJ) is deliberately NOT
-- persisted: it is only forwarded to the provider at create time.
CREATE TABLE IF NOT EXISTS aro_checkout_session (
  id                    text PRIMARY KEY,
  "tenantId"            text NOT NULL,
  "projectId"           text NOT NULL REFERENCES aro_project_config("projectId"),
  "orderId"             text NOT NULL,
  "offerId"             text NOT NULL REFERENCES aro_offer(id),
  "contactId"           text,
  "idempotencyKey"      text NOT NULL,
  "requestHash"         text NOT NULL,
  state                 text NOT NULL DEFAULT 'CREATED'
    CHECK (state IN ('CREATED','PENDING','APPROVED','FAILED','CANCELED','EXPIRED','REFUNDED','CHARGEBACK')),
  market                text NOT NULL,
  country               text,
  method                text NOT NULL CHECK (method IN ('PIX','CARD')),
  "amountMinor"         bigint NOT NULL CHECK ("amountMinor" >= 0),
  currency              text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  "bumpOfferIds"        text[] NOT NULL DEFAULT '{}',
  attribution           jsonb NOT NULL DEFAULT '{}',
  metadata              jsonb NOT NULL DEFAULT '{}',
  "paymentInstruction"  jsonb,
  "lastErrorCode"       text,
  "expiresAt"           timestamptz,
  "createdAt"           timestamptz NOT NULL DEFAULT now(),
  "updatedAt"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aro_checkout_session_idem_key UNIQUE ("projectId", "idempotencyKey"),
  CONSTRAINT aro_checkout_session_order_fkey
    FOREIGN KEY ("tenantId", "orderId") REFERENCES commerce_order("tenantId", id),
  CONSTRAINT aro_checkout_session_contact_fkey
    FOREIGN KEY ("tenantId", "contactId") REFERENCES crm_contact("tenantId", id)
);
CREATE INDEX IF NOT EXISTS aro_checkout_session_order_idx ON aro_checkout_session ("orderId");

-- 2.7 Order items (commerce_quote_line is quote-bound; orders have no lines).
CREATE TABLE IF NOT EXISTS aro_order_item (
  id                 text PRIMARY KEY,
  "tenantId"         text NOT NULL,
  "orderId"          text NOT NULL,
  "offerId"          text NOT NULL REFERENCES aro_offer(id),
  "productId"        text NOT NULL REFERENCES catalog_product(id),
  title              text NOT NULL,
  quantity           integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  "unitAmountMinor"  bigint NOT NULL CHECK ("unitAmountMinor" >= 0),
  currency           text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  "entitlementKeys"  text[] NOT NULL DEFAULT '{}',
  CONSTRAINT aro_order_item_order_fkey
    FOREIGN KEY ("tenantId", "orderId") REFERENCES commerce_order("tenantId", id)
);
CREATE INDEX IF NOT EXISTS aro_order_item_order_idx ON aro_order_item ("orderId");

-- 2.8 Payment attempts = normalized payments. billing_payment is invoice-bound
-- (invoiceId NOT NULL) and provider-restricted, so consumer checkout payments
-- live here. One order may have several attempts (failover).
CREATE TABLE IF NOT EXISTS aro_payment_attempt (
  id                   text PRIMARY KEY,
  "tenantId"           text NOT NULL,
  "projectId"          text NOT NULL REFERENCES aro_project_config("projectId"),
  "orderId"            text NOT NULL,
  "checkoutSessionId"  text NOT NULL REFERENCES aro_checkout_session(id),
  "attemptNumber"      integer NOT NULL CHECK ("attemptNumber" >= 1),
  "providerAccountId"  text NOT NULL REFERENCES aro_provider_account(id),
  provider             text NOT NULL,
  "providerPaymentId"  text,
  "idempotencyKey"     text NOT NULL,
  state                text NOT NULL DEFAULT 'CREATED'
    CHECK (state IN ('CREATED','UNKNOWN','PENDING','APPROVED','FAILED','CANCELED','EXPIRED','REFUNDED','CHARGEBACK')),
  "providerStatus"     text,
  method               text NOT NULL CHECK (method IN ('PIX','CARD')),
  "amountMinor"        bigint NOT NULL CHECK ("amountMinor" >= 0),
  currency             text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  "feeMinor"           bigint,
  "netMinor"           bigint,
  "errorCode"          text,
  "routeSnapshot"      jsonb NOT NULL DEFAULT '{}',
  "createdAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"          timestamptz NOT NULL DEFAULT now(),
  "approvedAt"         timestamptz,
  "reversedAt"         timestamptz,
  CONSTRAINT aro_payment_attempt_number_key UNIQUE ("orderId", "attemptNumber"),
  CONSTRAINT aro_payment_attempt_idem_key UNIQUE ("idempotencyKey"),
  CONSTRAINT aro_payment_attempt_provider_ref_key UNIQUE (provider, "providerPaymentId"),
  CONSTRAINT aro_payment_attempt_order_fkey
    FOREIGN KEY ("tenantId", "orderId") REFERENCES commerce_order("tenantId", id)
);
CREATE INDEX IF NOT EXISTS aro_payment_attempt_pending_idx
  ON aro_payment_attempt (state, "updatedAt") WHERE state IN ('UNKNOWN','PENDING');
CREATE INDEX IF NOT EXISTS aro_payment_attempt_project_idx
  ON aro_payment_attempt ("projectId", "approvedAt");

-- 2.9 Refunds / chargebacks (provider-independent reversal record).
CREATE TABLE IF NOT EXISTS aro_refund (
  id                  text PRIMARY KEY,
  "tenantId"          text NOT NULL,
  "projectId"         text NOT NULL REFERENCES aro_project_config("projectId"),
  "paymentAttemptId"  text NOT NULL REFERENCES aro_payment_attempt(id),
  "orderId"           text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('REFUND','CHARGEBACK')),
  "amountMinor"       bigint NOT NULL CHECK ("amountMinor" >= 0),
  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  "providerRef"       text,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aro_refund_attempt_kind_key UNIQUE ("paymentAttemptId", kind)
);

-- 2.10 Durable outbox of normalized project events.
CREATE TABLE IF NOT EXISTS aro_outbound_event (
  id           text PRIMARY KEY,
  "tenantId"   text NOT NULL,
  "projectId"  text NOT NULL REFERENCES aro_project_config("projectId"),
  type         text NOT NULL CHECK (type IN (
                 'checkout.started','payment.pending','payment.approved','payment.failed',
                 'payment.refunded','payment.chargeback','order.approved',
                 'entitlement.granted','entitlement.revoked')),
  "dedupeKey"  text NOT NULL,
  body         text NOT NULL,           -- exact JSON bytes that are signed and sent
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aro_outbound_event_dedupe_key UNIQUE ("dedupeKey")
);
CREATE INDEX IF NOT EXISTS aro_outbound_event_project_idx ON aro_outbound_event ("projectId", "createdAt");

-- 2.11 Delivery state per (event, endpoint).
CREATE TABLE IF NOT EXISTS aro_webhook_delivery (
  id               text PRIMARY KEY,
  "eventId"        text NOT NULL REFERENCES aro_outbound_event(id),
  "endpointUrl"    text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','dead')),
  attempts         integer NOT NULL DEFAULT 0,
  "nextAttemptAt"  timestamptz NOT NULL DEFAULT now(),
  "lastStatusCode" integer,
  "lastError"      text,
  "deliveredAt"    timestamptz,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aro_webhook_delivery_event_endpoint_key UNIQUE ("eventId", "endpointUrl")
);
CREATE INDEX IF NOT EXISTS aro_webhook_delivery_due_idx
  ON aro_webhook_delivery ("nextAttemptAt") WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. Row level security and grants
-- ---------------------------------------------------------------------------
-- ARO is a multi-project service that enforces project scope in the
-- application layer (API key → project). It reaches the database only as
-- aro_runtime. New tables: RLS on, aro_runtime-only policy, nothing for
-- anon/authenticated. Reused tables: additional aro_runtime policy; existing
-- waas_runtime policies are untouched.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'aro_project_config','aro_api_key','aro_offer','aro_catalog_revision','aro_fulfillment_rule',
    'aro_provider_account','aro_payment_route',
    'aro_checkout_session','aro_order_item','aro_payment_attempt','aro_refund',
    'aro_outbound_event','aro_webhook_delivery'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'aro_runtime_access') THEN
      EXECUTE format('CREATE POLICY aro_runtime_access ON %I TO aro_runtime USING (true) WITH CHECK (true)', t);
    END IF;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO aro_runtime', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'Tenant','Project','catalog_product','catalog_price','crm_contact',
    'commerce_order','commerce_entitlement','billing_webhook_event','AuditEvent'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'aro_runtime_access') THEN
      EXECUTE format('CREATE POLICY aro_runtime_access ON %I TO aro_runtime USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

GRANT SELECT ON "Tenant", "Project", catalog_product, catalog_price TO aro_runtime;
GRANT SELECT, INSERT ON crm_contact TO aro_runtime;
GRANT SELECT, INSERT, UPDATE ON commerce_order, commerce_entitlement, billing_webhook_event TO aro_runtime;
GRANT INSERT ON "AuditEvent" TO aro_runtime;
