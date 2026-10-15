# Production Checklist

## Project readiness (project team)

**Contract**
- [ ] Uses the ARO API only — no provider SDKs or credentials.
- [ ] Offer codes and entitlement keys come from the ARO catalog.
- [ ] Money handled as integer minor units + ISO currency.
- [ ] Only normalized ARO states are shown.

**Checkout**
- [ ] Sends a fresh `Idempotency-Key` per purchase attempt; retries reuse it.
- [ ] Collects a valid CPF/CNPJ for PIX.
- [ ] Renders the QR from `qr_payload` unaltered and shows `copy_paste`.
- [ ] Renders `PENDING`, `APPROVED`, `FAILED`/`EXPIRED`/`CANCELED` safely.

**Webhook**
- [ ] Raw body verified (timestamp tolerance, HMAC, constant-time compare).
- [ ] Event ids deduplicated; handler returns 2xx fast.

**Access**
- [ ] Protected routes call `entitlements/resolve` server-side.
- [ ] Missing/revoked rights deny access; bundles grant every key.

**Security**
- [ ] Server key and webhook secret only on the server; no CPF/keys in logs.

## Release proof (project + ARO operations)

- [ ] Controlled real payment → `APPROVED`.
- [ ] Order `APPROVED`; entitlement `ACTIVE`; content opens.
- [ ] Project webhook received with valid signatures.
- [ ] Duplicate provider event harmless.
- [ ] Refund → order `REFUNDED`, entitlement revoked, access denied.
- [ ] Rollback path known.

## ARO platform readiness (ARO operations)

- [ ] Image deployed from a CI-green SHA; `/health` → `status: ok`, `db: up`.
- [ ] Migration reviewed and applied; Supabase advisors clean.
- [ ] Provider secrets and project webhook secret provisioned; keys issued.
- [ ] Catalog validated and synced; routes active.
- [ ] Provider webhook endpoints configured (Stripe dashboard; PixGo/MisticPay set per charge).
- [ ] Rollback documented (`docs/40_ARO_RUNTIME_RUNBOOK.md`).

When all apply: **ARO INTEGRATION READY**. Public sales still require the project's release approval.
