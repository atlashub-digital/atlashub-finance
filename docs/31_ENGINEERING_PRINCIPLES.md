# ARO Engineering Principles

## 1. Provider-agnostic core

Provider payloads stop at adapter boundaries.

No project, entitlement resolver or reporting surface should depend on PixGo/MisticPay/Stripe field names.

## 2. Canonical IDs

ARO creates canonical IDs.

External provider IDs are references, never primary domain identity.

## 3. Money is immutable history

Never rewrite financial history to represent correction.

Use:
- transition;
- reversal;
- refund;
- adjustment;
- reconciliation entry.

## 4. Webhook is signal, not universal truth

Trust policy is adapter-specific:
- cryptographically signed webhook;
- verified-by-fetch;
- polling/reconciliation.

Entitlement is granted only after provider-specific confirmation policy is satisfied.

## 5. Ambiguous create is a first-class state

Timeout after create may mean the provider created a payable transaction.

Do not blindly retry.

Recover/reconcile before creating another payable instrument.

## 6. Idempotency everywhere

Required for:
- checkout creation;
- provider create;
- webhook processing;
- payment normalization;
- order transition;
- entitlement grant/revoke;
- refund actions.

## 7. Audit by default

Every sensitive mutation records:
- actor;
- tenant/project;
- reason;
- before/after;
- evidence/reference;
- timestamp.

## 8. Secrets are references

Business configuration may reference credentials.

It never stores production secrets in ordinary project tables or Git.

## 9. Tenant isolation

All reads/writes are scoped.

Client mode is designed from day one even if AtlasHub is the first operator.

## 10. Progressive extraction

EspelhoMeu may temporarily contain pilot code.

Once behavior is proven, shared logic migrates to ARO.

Never delay a validated revenue launch solely to achieve theoretical platform purity.

## 11. API before direct DB

Projects integrate through ARO contracts/APIs.

Direct cross-project table writes are prohibited.

## 12. Agent-safe by design

Any future Hermes tool must map to explicit APIs with:
- scope;
- action class;
- permission;
- idempotency;
- audit.

## 13. Observability is part of correctness

Payment correctness includes:
- state;
- latency;
- retries;
- webhook backlog;
- reconciliation;
- provider health.

## 14. Release with reversible gates

Use feature flags/configuration for:
- commerce enabled;
- route enabled;
- entitlement enforcement;
- provider production mode.

## 15. Fast launch doctrine

For each new project:

```
prove one real sale
→ prove entitlement
→ prove refund/revoke
→ expand providers/routes
→ optimize
```
