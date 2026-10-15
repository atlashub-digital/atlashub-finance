# ARO LEGO Component Map

## Objective

ARO must remain composable. Each component has a stable responsibility and can evolve independently.

## Foundation blocks

### Identity Block
Inputs:
- Tenant
- Project
- Contact

Provides scoping only.

### Catalog Block
- Product
- Price
- Offer
- Bundle
- Subscription definition

### Checkout Block
- checkout session
- payer requirements
- attribution
- bump selection

### Routing Block
- provider accounts
- routes
- health
- route decision

### Provider Adapter Block
One adapter per rail/provider.

Examples:
- PixGo
- MisticPay
- Stripe
- future providers

### Payment Block
- attempts
- normalized payment
- provider events
- refund/chargeback

### Order Block
- order
- items
- lifecycle

### Entitlement Block
- grant
- revoke
- resolve
- expiry

### Finance Block
- operational ledger
- provider fees
- settlement
- reconciliation

### Revenue Intelligence Block
- funnel
- acquisition attribution
- AOV/LTV
- provider/project/product analytics

### Workforce Block
- dashboard
- operator permissions
- Hermes Finance Operator
- approvals/audit

## Dependency direction

```
Project UI
   ↓
ARO API
   ↓
Catalog / Checkout
   ↓
Routing
   ↓
Provider Adapter
   ↓
Payment / Order
   ↓
Entitlement + Ledger
   ↓
Revenue Intelligence
   ↓
Workforce UI / Hermes
```

No provider adapter may own customer access logic.

No Workforce agent may bypass ARO authority boundaries.

No project may write provider state directly into entitlements.

## Swappability test

A valid ARO design must allow:

> Replace PixGo with another PIX provider without changing EspelhoMeu product pages or WebReader.

If that is not true, provider coupling has leaked across the LEGO boundary.
