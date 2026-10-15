# Contributing to ARO

## Before coding

Read:
1. docs/INDEX.md
2. docs/12_DECISION_REGISTER.md
3. docs/25_LEGO_COMPONENT_MAP.md
4. relevant provider file

## Rules

- no provider-specific logic in project contracts;
- no secrets in repository;
- money in canonical minor units internally;
- provider IDs are external refs;
- financial mutations are idempotent;
- tests accompany adapter/status changes;
- update documentation when a contract changes;
- add ADR for material architecture decisions.

## Pull requests

A PR must state:
- problem;
- architecture boundary touched;
- schema impact;
- provider impact;
- security/PII impact;
- tests;
- rollout/rollback;
- SALES READY impact where applicable.

## Provider research

Use current official documentation.
Record source URLs and review date in the provider documentation.
