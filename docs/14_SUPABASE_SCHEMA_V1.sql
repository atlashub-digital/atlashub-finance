-- ARO — Atlas Revenue Operations
-- REFERENCE MODEL ONLY — DO NOT APPLY AS-IS.
-- The live AtlasHub Supabase already contains overlapping Tenant/Project,
-- catalog_*, crm_*, commerce_* and billing_* domains.
-- Production ARO DDL must be additive and derived from
-- docs/19_ATLASHUB_SUPABASE_ALIGNMENT.md.
-- This file is not an executed migration.

create schema if not exists aro;

create table if not exists aro.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  legal_entity_ref text,
  default_currency text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aro.contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  email text,
  locale text,
  market text,
  consent_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_project_email_idx
  on aro.contacts(project_id, lower(email));

create table if not exists aro.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  code text not null,
  name text not null,
  status text not null default 'active',
  fulfillment_type text not null default 'digital',
  metadata jsonb not null default '{}'::jsonb,
  unique(project_id, code)
);

create table if not exists aro.offers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  code text not null,
  name text not null,
  currency text not null,
  amount_minor bigint not null,
  cadence text not null default 'once',
  status text not null default 'active',
  product_refs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique(project_id, code)
);

create table if not exists aro.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references aro.projects(id),
  provider text not null,
  environment text not null default 'production',
  account_ref text,
  credential_ref text not null,
  status text not null default 'active',
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists aro.payment_routes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  market text,
  country text,
  currency text not null,
  payment_method text not null,
  provider_account_id uuid not null references aro.provider_accounts(id),
  priority integer not null default 100,
  enabled boolean not null default true,
  rule_version text not null default 'v1',
  conditions jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists payment_routes_lookup_idx
  on aro.payment_routes(project_id, currency, payment_method, enabled, priority);

create table if not exists aro.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  contact_id uuid references aro.contacts(id),
  offer_id uuid not null references aro.offers(id),
  market text,
  currency text not null,
  payment_method text not null,
  amount_minor bigint not null,
  attribution jsonb not null default '{}'::jsonb,
  route_decision jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aro.orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  checkout_session_id uuid references aro.checkout_sessions(id),
  contact_id uuid references aro.contacts(id),
  offer_id uuid not null references aro.offers(id),
  currency text not null,
  amount_minor bigint not null,
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists aro.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references aro.orders(id) on delete cascade,
  product_code text not null,
  offer_code text not null,
  title text not null,
  amount_minor bigint not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists aro.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  order_id uuid not null references aro.orders(id),
  provider_account_id uuid not null references aro.provider_accounts(id),
  payment_method text not null,
  provider_payment_id text,
  state text not null default 'created',
  error_code text,
  route_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_attempt_provider_ref_uq
  on aro.payment_attempts(provider_account_id, provider_payment_id)
  where provider_payment_id is not null;

create table if not exists aro.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  order_id uuid not null references aro.orders(id),
  payment_attempt_id uuid references aro.payment_attempts(id),
  provider text not null,
  provider_payment_id text not null,
  payment_method text not null,
  currency text not null,
  amount_gross_minor bigint not null,
  provider_fee_minor bigint,
  amount_net_minor bigint,
  status text not null,
  authorized_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create table if not exists aro.payment_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references aro.projects(id),
  provider text not null,
  provider_event_id text not null,
  provider_payment_id text,
  event_type text not null,
  payload_hash text not null,
  trust_level text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table if not exists aro.entitlements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  contact_id uuid references aro.contacts(id),
  order_id uuid references aro.orders(id),
  product_code text not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id, product_code)
);

create table if not exists aro.refunds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  payment_id uuid not null references aro.payments(id),
  provider_ref text,
  amount_minor bigint not null,
  currency text not null,
  status text not null,
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists aro.funnel_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  contact_id uuid references aro.contacts(id),
  checkout_session_id uuid references aro.checkout_sessions(id),
  order_id uuid references aro.orders(id),
  event_name text not null,
  offer_code text,
  attribution jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists aro.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references aro.projects(id),
  order_id uuid references aro.orders(id),
  payment_id uuid references aro.payments(id),
  provider_account_id uuid references aro.provider_accounts(id),
  currency text not null,
  entry_type text not null,
  amount_minor bigint not null,
  settlement_ref text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists aro.settlements (
  id uuid primary key default gen_random_uuid(),
  provider_account_id uuid not null references aro.provider_accounts(id),
  provider_settlement_ref text not null,
  currency text not null,
  gross_minor bigint,
  fees_minor bigint,
  net_minor bigint,
  status text not null,
  period_start timestamptz,
  period_end timestamptz,
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(provider_account_id, provider_settlement_ref)
);

-- RLS, service roles, audit triggers and operator policies are intentionally
-- omitted from this draft and must be added before production application.
