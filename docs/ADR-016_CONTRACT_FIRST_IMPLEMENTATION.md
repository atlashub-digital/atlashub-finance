# ADR-016 — Contract-first ARO implementation

**Status:** ACCEPTED

## Decision

ARO implementation proceeds contract-first.

The canonical engineering interface is:
- `openapi/aro-v1.yaml`;
- `docs/35_PROJECT_INTEGRATION_CONTRACT_V1.md`;
- `docs/36_HERMES_TOOL_CONTRACT_V1.md`;
- `docs/37_BACKEND_IMPLEMENTATION_SPEC_V1.md`.

CODEX, Claude Code, Hermes engineering agents and human developers must implement against these contracts.

## Rationale

AtlasHub has multiple projects waiting for payments.

Repeated project-local provider integrations are explicitly rejected.

The contract must stabilize before extraction/generalization so that:
- EspelhoMeu;
- LeveLab;
- Atlas Club;
- future projects;

integrate with the same API.

## Hermes placement

Hermes is a client/operator **above** ARO.

Payment processing does not depend on LLM availability.

## Outbound project webhooks

ARO emits signed, normalized, at-least-once project events.

Project webhooks are notifications; canonical entitlement remains queryable from ARO.

## Multicurrency

Money contracts are natively multi-currency from V1 using integer minor units + ISO-4217 currency.

FX and settlement currencies are distinct concepts.

## Source of truth

Chat instructions cannot override the versioned contracts without a repository decision update.
