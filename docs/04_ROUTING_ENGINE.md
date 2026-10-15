# ARO Payment Routing Engine

## Purpose

Choose the best eligible provider/account for a payment attempt without exposing provider logic to projects.

## Rule inputs

V1:
- project
- market
- country
- currency
- payment method
- environment
- provider/account enabled status
- priority

Future:
- amount band
- provider health
- approval/success rate
- provider fee
- settlement delay
- risk score
- account capacity
- time window
- currency conversion cost
- treasury position

## Example

```
EspelhoMeu
BR
BRL
PIX
↓
Route #1 PixGo
Route #2 MisticPay
```

International:

```
EspelhoMeu
INTL
EUR/USD
CARD
↓
Stripe
```

## Routing result

Every decision must persist:
- eligible routes considered;
- chosen route;
- rule version;
- reason code;
- timestamp.

## Fallback

Fallback is allowed only when:
- no approved payment exists;
- previous attempt is terminal or explicitly abandoned;
- order amount/items are unchanged;
- provider-specific payment cannot later produce an ambiguous double settlement.

PIX fallback must therefore be conservative: do not issue multiple concurrently payable QR codes for the same order unless the business explicitly accepts reconciliation risk.

## Agent recommendations

The Hermes Finance Operator may recommend:
- changing priority;
- disabling degraded provider;
- changing routing for cost/performance.

It cannot silently change production routing unless policy explicitly permits the action class.
