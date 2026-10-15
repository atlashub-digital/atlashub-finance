# Versioning & Change Management

## Contracts

ARO external project contracts use explicit API versioning:

`/v1/...`

Provider adapters have independent adapter versions.

Routing rules persist `rule_version`.

## Change types

### Compatible
- optional response field
- new provider adapter
- new event type handled by tolerant consumer

### Migration required
- canonical status semantic change
- money representation change
- entitlement contract change
- required checkout field change

### Breaking
Requires new API contract version or coordinated migration.

## Decision records

Material architectural changes require ADR entry in `12_DECISION_REGISTER.md`.

## Provider changes

Provider docs can change without ARO code changing.

Each provider review records:
- source/date;
- API version if applicable;
- changed authentication;
- changed payload;
- changed limits;
- required adapter action.

## Rollback

Production route/provider changes must retain:
- previous configuration version;
- effective timestamp;
- actor;
- rollback mechanism.
