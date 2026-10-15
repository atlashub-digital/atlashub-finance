# ARO Operations Runbook

## Daily checks

- payment volume by project/provider;
- provider success rate;
- pending-age distribution;
- webhook failures;
- orphan events;
- refund/chargeback events;
- reconciliation exceptions;
- provider fee anomalies;
- settlements expected vs observed.

## Provider outage

1. confirm health from provider/API;
2. mark route degraded;
3. stop new attempts if threshold reached;
4. route new eligible checkouts to fallback when safe;
5. preserve existing payable attempts;
6. communicate incident;
7. reconcile after recovery.

## Payment approved but entitlement missing

1. locate order/payment;
2. verify provider state;
3. verify normalized payment APPROVED;
4. inspect entitlement outbox/grant;
5. replay idempotently;
6. audit action.

## Entitlement active but payment invalid

1. freeze entitlement if policy requires;
2. verify provider/ledger;
3. establish cause;
4. revoke using compensating event;
5. notify support/customer if appropriate;
6. create incident if systemic.

## Refund

Refund state must always flow:
provider refund → normalized refund → payment/order transition → entitlement policy → ledger adjustment.

## Reconciliation exception SLA

Suggested:
- duplicate/ambiguous payment: immediate;
- approved without entitlement: immediate;
- provider paid / internal pending: <1h;
- fee mismatch: daily;
- settlement mismatch: same business day.

## Agent operations

Hermes can triage and summarize continuously.

Sensitive remediation follows the action classes in `08_HERMES_FINANCE_OPERATOR.md`.
