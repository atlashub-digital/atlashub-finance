# Observability & SLOs

## Required telemetry

Every payment path should produce structured events for:

- checkout_session_created
- route_selected
- provider_request_started
- provider_request_completed
- provider_request_failed
- payment_pending
- payment_approved
- payment_failed
- webhook_received
- webhook_rejected
- webhook_processed
- entitlement_granted
- entitlement_revoked
- reconciliation_exception

## Correlation

All logs/events use:
- trace_id
- tenant_id
- project_id
- checkout_session_id
- order_id
- payment_attempt_id
- provider
- provider_payment_id when safe

Never use payer document/email as log correlation keys.

## Initial SLO targets

These are operational targets, not guarantees.

- ARO API availability: 99.9% monthly target
- checkout create internal latency excluding provider: p95 < 500 ms
- provider request timeout: bounded, adapter-specific
- webhook ingestion: p95 < 2 s internal handling before external verification
- approved payment → entitlement: p95 < 30 s
- duplicate entitlement grants: 0 tolerated
- unverified provider event granting access: 0 tolerated

## Alerts

Critical:
- duplicate approved payments/order ambiguity
- invalid webhook signature spike
- payment approved without entitlement
- entitlement granted without approved payment
- provider secret/auth failure
- reconciliation imbalance above policy threshold

Warning:
- provider latency
- conversion drop
- increased pending-age
- fee anomaly
- webhook retry growth

## Hermes consumption

Finance Operator should consume summarized telemetry and exception queues, not raw unrestricted logs by default.
