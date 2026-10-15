# Security Policy — Atlas Revenue Operations

ARO handles revenue, payment metadata and customer identity references. Security changes are treated as production-critical.

## Never commit

- provider API keys;
- webhook secrets;
- private keys;
- service-role keys;
- customer documents;
- real provider payloads containing PII.

## Reporting

Security issues should be handled privately through AtlasHub operational security channels, not public GitHub issues when disclosure could expose an active weakness.

## Required controls

- least privilege;
- server-side tenant/project scope;
- signed or re-verified webhooks;
- idempotency;
- RLS for exposed data;
- secret manager/Vault;
- audit logging;
- explicit financial authority levels.

See `docs/09_SECURITY_GOVERNANCE.md`.
