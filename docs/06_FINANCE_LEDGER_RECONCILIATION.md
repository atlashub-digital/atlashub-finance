# Finance Ledger & Reconciliation

## Objective

Give AtlasHub a normalized operational view of gross → fees → net → settlement, independent of provider.

## Ledger model

Append-only entries with:
- project_id
- order_id
- payment_id
- provider_account_id
- currency
- entry_type
- amount_minor
- occurred_at
- settlement_ref
- metadata

Initial entry types:
- PAYMENT_GROSS
- PROVIDER_FEE
- PLATFORM_FEE
- REFUND
- CHARGEBACK
- ADJUSTMENT
- SETTLEMENT
- PAYOUT

## Important distinction

ARO ledger is an operational revenue ledger, not statutory accounting.

It may feed accounting/export systems later.

## Reconciliation layers

### Transaction reconciliation
Provider payment ↔ ARO payment/order.

### Fee reconciliation
Expected provider fee ↔ provider reported fee.

### Settlement reconciliation
Approved net payments ↔ settlement batch.

### Payout reconciliation
Settlement/available balance ↔ payout/bank receipt where data exists.

## Exception queue

Reconciliation creates explicit exceptions:
- provider paid / ARO pending;
- ARO approved / provider not confirmed;
- fee mismatch;
- missing settlement;
- duplicate external reference;
- unexpected refund;
- orphan webhook.

The Finance Operator Agent can triage and recommend actions but cannot fabricate balancing entries.

## Multicurrency

Every amount preserves original:
- currency
- amount_minor

FX conversions produce explicit linked entries with:
- source amount/currency;
- destination amount/currency;
- rate;
- fee/spread;
- rate source;
- timestamp.

Never overwrite original monetary values with converted display amounts.
