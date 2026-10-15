# Provider Adapter Template

## Provider

Name:
Adapter key:
Markets:
Currencies:
Methods:
Environment/sandbox:

## Official references

- documentation:
- authentication:
- webhooks:
- status endpoint:
- refunds:

Last reviewed:

## Authentication

Secret types:
Credential storage:
Required scopes:
Rotation procedure:

## Capabilities

- create payment:
- status lookup:
- webhook:
- signed webhook:
- refunds:
- chargeback/dispute:
- fees:
- settlement API:

## Create contract mapping

ARO field → provider field.

## Response mapping

Provider field → ARO canonical field.

## Status normalization

| Provider | ARO |
|---|---|
| ... | ... |

## Webhook trust

SIGNED / VERIFIED_BY_FETCH / UNTRUSTED

Verification algorithm:

## Idempotency

Creation:
Events:

## Error normalization

List stable provider error codes and ARO mapping.

## Limits

Min:
Max:
Rate limits:
Document requirements:

## Operational risks

- ...

## Production proof

- controlled transaction:
- webhook:
- status:
- fee:
- entitlement:
- reconciliation:

## Release state

RESEARCH / IMPLEMENTED / PILOT / PRODUCTION
