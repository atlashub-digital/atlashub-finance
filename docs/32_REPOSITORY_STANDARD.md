# ARO Repository Standard

## Purpose

This repository is the professional source of truth for ARO.

It must remain understandable to:
- engineering;
- operations;
- finance;
- security;
- AI agents;
- future team members;
- client implementation teams.

## Required categories

### Product / strategy
- vision;
- scope;
- terminology;
- roadmap;
- decisions.

### Architecture
- system architecture;
- domain model;
- API contracts;
- data model;
- event/state models;
- provider adapter contract;
- routing.

### Operations
- runbooks;
- release gates;
- incident handling;
- reconciliation;
- observability;
- SLOs.

### Security
- secrets;
- roles;
- tenant isolation;
- audit;
- data retention;
- provider credential policy.

### Agentic operation
- Hermes operator role;
- tools;
- permissions;
- approval model;
- audit model;
- research/intelligence scope.

### Integration
- project onboarding;
- provider onboarding;
- adapter templates;
- testing fixtures;
- migration guides.

## Documentation rules

1. A decision that changes architecture must enter the Decision Register.
2. Provider assumptions must live in provider docs.
3. No secret, PII sample or production credential is committed.
4. Examples use fictional identifiers.
5. All amounts state currency.
6. Draft assumptions are labelled.
7. Runtime behavior that differs from docs is a defect.
8. Chat is not source of truth.
9. Agent prompts may reference docs but cannot override canonical contracts.
10. Deprecated documents must point to their replacement.

## LEGO rule

Every reusable piece must have:
- responsibility;
- inputs;
- outputs;
- dependencies;
- invariants;
- failure modes;
- tests;
- observability;
- owner.

## Definition of documented

A component is not professionally documented until another engineer or agent can:
1. understand its purpose;
2. integrate it;
3. operate it;
4. troubleshoot it;
5. replace it without breaking adjacent blocks.
