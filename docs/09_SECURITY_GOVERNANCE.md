# Security & Governance

## Tenancy

All ARO APIs enforce project/organization scope server-side.

Never trust a project_id provided by a public client without validating its authenticated integration context.

## Secrets

Never store plaintext provider secrets in ordinary configuration tables.

Use secret references + Vault/deployment secret manager.

## PII

Collect minimum payer identity required by:
- payment provider;
- fraud/compliance policy;
- entitlement/account recovery.

Provider raw payloads with PII should not become analytics tables.

## Payments

ARO never receives raw card PAN/CVV.

PIX payer data is handled according to provider requirements and retention policy.

## Webhooks

Required:
- HTTPS;
- signature validation where available;
- status re-verification where signature is absent/insufficient;
- replay/idempotency controls;
- raw payload hash;
- bounded raw retention if raw storage is needed;
- no secrets in logs.

## Database

Recommended:
- Supabase schema `aro`;
- service-role writes only from trusted backend;
- RLS for operator/dashboard access;
- immutable audit records;
- least-privilege database roles.

## Financial permissions

Separate permissions:
- read revenue;
- read PII;
- manage offers;
- manage routing;
- manage providers;
- issue refunds;
- manage entitlements;
- view settlements;
- initiate payout/treasury.

## Production changes

Provider and routing changes require:
- versioned config;
- audit event;
- rollback path;
- effective_at timestamp.

## Incident policy

Any suspicion of:
- duplicate charge;
- wrong grant;
- webhook spoofing;
- credential leak;
- unexpected routing;
- reconciliation imbalance

creates a finance/security incident and freezes automation for the affected scope until triage.
