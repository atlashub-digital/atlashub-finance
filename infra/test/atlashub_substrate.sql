-- TEST FIXTURE ONLY. Never apply to AtlasHub.
--
-- Reproduces the subset of the live AtlasHub public schema that ARO reuses,
-- as inspected read-only on 2026-10-15 (Supabase ref aakdyumavlzgyklbrsrw,
-- waas_migrations head 202610090007_workspaces_projects). Columns, defaults,
-- CHECK/UNIQUE/FK constraints and RLS shape mirror production so the ARO
-- additive migration is exercised against the real substrate in CI.
-- Tables ARO does not touch are reduced to the stubs needed by foreign keys.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'waas_runtime') THEN
    CREATE ROLE waas_runtime NOLOGIN;
  END IF;
END $$;

CREATE FUNCTION public.waas_scope() RETURNS text LANGUAGE sql STABLE SET search_path TO ''
AS $f$ SELECT nullif(current_setting('app.scope', true), '') $f$;
CREATE FUNCTION public.waas_tenant() RETURNS text LANGUAGE sql STABLE SET search_path TO ''
AS $f$ SELECT nullif(current_setting('app.tenant_id', true), '') $f$;

CREATE TABLE "Tenant" (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Membership" (
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  "userId" text NOT NULL,
  PRIMARY KEY ("tenantId", "userId")
);

CREATE TABLE "Project" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  slug text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sandbox'
    CHECK (status = ANY (ARRAY['planning','sandbox','active','paused','archived'])),
  modules text[] NOT NULL DEFAULT '{}'
    CHECK (modules <@ ARRAY['workforce','ami','community','media']),
  "supervisorUserId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", id),
  UNIQUE ("tenantId", slug),
  FOREIGN KEY ("tenantId", "supervisorUserId") REFERENCES "Membership"("tenantId", "userId")
);

CREATE TABLE "Role" (id text PRIMARY KEY);
CREATE TABLE catalog_mission_template (id text PRIMARY KEY);

CREATE TABLE catalog_product (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind = ANY (ARRAY['mission','subscription','addon','setup','credit_pack'])),
  "roleId" text REFERENCES "Role"(id),
  "templateId" text REFERENCES catalog_mission_template(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','active','retired'])),
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE catalog_price (
  id text PRIMARY KEY,
  "productId" text NOT NULL REFERENCES catalog_product(id),
  currency text NOT NULL CHECK (currency = ANY (ARRAY['BRL','EUR','USD'])),
  "pricingModel" text NOT NULL CHECK ("pricingModel" = ANY (ARRAY['flat','per_seat','per_unit','tiered','package','mission_fixed','custom'])),
  "interval" text NOT NULL CHECK ("interval" = ANY (ARRAY['one_time','month','quarter','year'])),
  "amountMinor" bigint CHECK ("amountMinor" >= 0),
  "includedQuantity" integer,
  "overageMinor" bigint,
  "usageMetric" text,
  "trialDays" integer CHECK ("trialDays" = ANY (ARRAY[3, 7])),
  market text NOT NULL DEFAULT '*',
  "taxBehavior" text NOT NULL DEFAULT 'exclusive' CHECK ("taxBehavior" = ANY (ARRAY['inclusive','exclusive'])),
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','active','retired'])),
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX catalog_price_product_idx ON catalog_price ("productId", currency, status);

CREATE TABLE crm_company (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  UNIQUE ("tenantId", id)
);

CREATE TABLE crm_contact (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  "companyId" text,
  "fullName" text NOT NULL,
  "emailNorm" text,
  "phoneE164" text,
  "preferredLocale" text NOT NULL DEFAULT 'pt-BR',
  timezone text,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("tenantId", id),
  FOREIGN KEY ("tenantId", "companyId") REFERENCES crm_company("tenantId", id)
);
CREATE UNIQUE INDEX crm_contact_email_key ON crm_contact ("tenantId", "emailNorm") WHERE "emailNorm" IS NOT NULL;
CREATE UNIQUE INDEX crm_contact_phone_key ON crm_contact ("tenantId", "phoneE164") WHERE "phoneE164" IS NOT NULL;

CREATE TABLE commerce_order (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  "quoteId" text,
  status text NOT NULL DEFAULT 'pending_payment',
  currency text NOT NULL,
  "totalMinor" bigint NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT commerce_order_status_check
    CHECK (status = ANY (ARRAY['pending_payment','paid','fulfilling','fulfilled','cancelled'])),
  UNIQUE ("tenantId", id)
);

CREATE TABLE commerce_entitlement (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"(id),
  key text NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['order','subscription','trial','grant'])),
  "sourceId" text NOT NULL,
  quantity integer,
  "validFrom" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" timestamp,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','expired','revoked'])),
  UNIQUE ("tenantId", key, source, "sourceId")
);

CREATE TABLE billing_webhook_event (
  id text PRIMARY KEY,
  provider text NOT NULL,
  "eventId" text NOT NULL,
  "eventType" text NOT NULL,
  "providerRef" text,
  "payloadSha256" text NOT NULL,
  facts jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'received' CHECK (status = ANY (ARRAY['received','processed','ignored','failed'])),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  "tenantId" text REFERENCES "Tenant"(id),
  "receivedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" timestamp,
  UNIQUE (provider, "eventId")
);

CREATE TABLE "AuditEvent" (
  id text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "actorId" text NOT NULL,
  action text NOT NULL,
  "objectId" text NOT NULL,
  at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Live RLS shape: enabled (not forced), policies only for waas_runtime.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_price ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_webhook_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Project" TO waas_runtime
  USING ("tenantId" = waas_tenant()) WITH CHECK ("tenantId" = waas_tenant());
CREATE POLICY tenant_isolation ON commerce_order TO waas_runtime
  USING ("tenantId" = waas_tenant()) WITH CHECK ("tenantId" = waas_tenant());
CREATE POLICY webhook_inbox ON billing_webhook_event TO waas_runtime
  USING (waas_scope() = ANY (ARRAY['billing_webhook','worker','platform']))
  WITH CHECK (waas_scope() = ANY (ARRAY['billing_webhook','worker','platform']));
