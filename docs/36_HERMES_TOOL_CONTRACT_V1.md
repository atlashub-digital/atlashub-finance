# Hermes ARO Tool Contract V1

## Purpose

This is the stable tool boundary between Hermes and ARO.

Hermes does not receive raw database credentials and never becomes the payment state machine.

ARO remains authority.

## Integration position

```
Atlas WorkForce UI
        │
        ├── Human Operator
        │
        └── Hermes Revenue & Finance Operator
                    │
                    ▼
              ARO Agent Tools
                    │
                    ▼
                  ARO API
                    │
       ┌────────────┼─────────────┐
       ▼            ▼             ▼
   Commerce      Finance       Revenue
       │
       ▼
 Payment Router / Providers
```

## Phase 0

No Hermes dependency for payment.

ARO emits operational notifications directly:
- payment approved;
- payment refunded;
- provider incident;
- reconciliation exception.

Telegram/Discord remain transport sinks.

## Phase 1 — Observer

Hermes may call read-only tools:

### revenue_overview

Input:
```json
{
  "scope": { "project": "espelhomeu" },
  "from": "2026-10-15T00:00:00Z",
  "to": "2026-10-16T00:00:00Z",
  "reporting_currency": "BRL"
}
```

Returns:
- gross;
- refunds;
- net;
- orders;
- approval rate;
- AOV;
- currency breakdown.

### list_payment_exceptions

Returns only operational exceptions:
- stale pending payment;
- provider lookup mismatch;
- webhook processing error;
- ambiguous create;
- reconciliation exception.

### get_order

Requires project scope + canonical order id.

### get_payment

Requires project scope + canonical payment id.

### compare_provider_health

Read-only comparison by:
- method;
- market;
- currency;
- success rate;
- create latency;
- confirmation latency;
- current health.

### list_settlement_exceptions

Finance-ops read-only.

## Phase 2 — Recommend

Hermes may create recommendations:

### propose_route_change

Does NOT mutate production.

Returns a proposal record containing:
- current route;
- proposed route;
- evidence;
- expected effect;
- risk;
- expiry;
- approval requirement.

### propose_provider_review

Used for:
- fee change;
- degraded health;
- market expansion;
- new currency/method.

### propose_checkout_improvement

Commercial recommendation only.

## Phase 3 — Controlled operations

All mutating tools require:
- actor identity;
- project/tenant scope;
- action class;
- reason;
- idempotency key;
- policy decision;
- audit record.

Examples:

### reconcile_payment

Permitted when policy allows safe status refetch.

It may:
- fetch provider truth;
- normalize result;
- resolve stale PENDING;
- record evidence.

It may not:
- fabricate APPROVED;
- bypass provider evidence.

### quarantine_provider_event

Low-risk operational action.

### request_refund_approval

Creates approval request. Does not issue refund.

### request_route_change_approval

Creates approval request. Does not change routing.

## Never autonomous in V1

Hermes cannot:
- withdraw;
- payout;
- transfer funds;
- change settlement bank;
- change provider credentials;
- execute crypto transfer;
- manually mark a payment APPROVED;
- create fake entitlement evidence.

## Authentication

Hermes receives an operator token issued for:
- tenant;
- project(s);
- role;
- action classes;
- expiry.

Example claims:

```json
{
  "sub": "agent:aro-revenue-operator",
  "tenant": "atlashub",
  "projects": ["espelhomeu", "levelab"],
  "scopes": [
    "revenue:read",
    "payments:read",
    "exceptions:read",
    "recommendations:write"
  ]
}
```

## Audit

Every tool call writes:
- request id;
- agent identity/version;
- tenant/project;
- tool;
- action class;
- inputs hash;
- evidence refs;
- policy result;
- approval id when applicable;
- result;
- timestamp.

## Memory rule

Hermes memory is never financial truth.

Before presenting current:
- revenue;
- balance;
- order/payment state;
- entitlement;
- provider health;

Hermes re-reads ARO.

## Multi-currency

Hermes must never add monetary values across currencies without:
1. explicit reporting currency;
2. reference FX source;
3. FX timestamp.

Raw views always preserve original transaction currency.

## Implementation rule

Agent tools are wrappers around stable ARO operator APIs.

Do not give Hermes direct SQL access merely because it is convenient.
