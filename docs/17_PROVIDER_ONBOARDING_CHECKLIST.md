# Provider Onboarding Checklist

## Research
- official docs captured
- supported markets/currencies/methods
- minimum/maximum amounts
- fees
- settlement timing
- refund/chargeback support
- webhook model
- sandbox availability
- rate limits
- compliance requirements

## Account
- legal entity
- merchant/account ref
- production status
- credential scopes
- IP allowlist if available
- credential_ref created
- no secrets committed

## Adapter
- create payment
- get status
- normalize states
- verify webhook or verify-by-fetch
- idempotency
- timeout/retry rules
- error normalization
- fee extraction
- refund flow if supported

## Routing
- project
- market/country
- currency
- method
- priority
- fallback policy
- effective_at

## Tests
- create payment
- invalid payer
- provider failure
- expired payment
- approved payment
- duplicate webhook
- delayed webhook
- reconciliation by status fetch
- refund/revoke where supported

## Operations
- health signal
- provider dashboard access
- escalation contact
- settlement reporting
- incident procedure

## Release
Provider is not production-routable until:
- adapter tests pass;
- secrets are in approved storage;
- real controlled transaction is reconciled;
- entitlement outcome is verified;
- operator runbook is updated.
