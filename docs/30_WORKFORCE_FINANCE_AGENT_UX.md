# Atlas WorkForce — Finance/Revenue Agent UX

## Goal

Revenue should feel like an operational department inside Atlas WorkForce.

A user who already sees:
- attendants;
- marketing managers;
- project operators;
- AI workforce members;

should also be able to work with a Finance/Revenue operator over the same company/project context.

## Primary experience

```
Atlas WorkForce
└── Revenue
    ├── Overview
    ├── Sales
    ├── Orders
    ├── Payments
    ├── Customers
    ├── Providers
    ├── Routing
    ├── Entitlements
    ├── Reconciliation
    ├── Settlements
    ├── Reports
    └── Finance Operator
```

## Agent card

Example:

**Revenue & Finance Operator**

Status:
- System healthy
- 3 exceptions
- R$ 12.840 gross today
- 97.8% PIX success
- 1 reconciliation action pending

Actions:
- Explain today's revenue
- Show exceptions
- Compare providers
- Review settlements
- Prepare weekly report
- Propose routing improvements

## Project scope

The same operator can be scoped to:

```
AtlasHub Group
→ Business Unit
→ Project
→ Client Tenant
```

Examples:
- Group-level operator sees consolidated revenue;
- EspelhoMeu operator sees only EspelhoMeu;
- client operator sees only that client's authorized data.

## Conversational examples

User:
> Porque caiu a conversão hoje?

Operator:
> Checkout starts remained stable, but PixGo approval latency increased after 16:20. 18 payments remain pending beyond the normal interval. MisticPay is healthy. I recommend investigating provider status before changing routing.

User:
> Qual produto vende mais depois do P01?

Operator:
> P02 is the most common next purchase; the P01→P02 order bump converts at X%. Collection conversion is Y%.

User:
> Quanto recebemos líquido esta semana?

Operator:
> Gross, fees, refunds and settlement differences are shown separately. Net estimate is based on reconciled provider data.

## Alerts

Examples:
- provider health degraded;
- pending payment spike;
- webhook backlog;
- refund spike;
- settlement mismatch;
- unusual fee change;
- currency exposure threshold;
- campaign spend with no revenue;
- route concentration risk.

## Approval inbox

Sensitive proposals appear as cards:

```
PROPOSED ROUTING CHANGE
BR / PIX
PixGo priority: 10 → 20
MisticPay priority: 20 → 10

Reason:
PixGo success rate fell below policy threshold.

Evidence:
...
[Approve] [Reject] [Ask Agent]
```

## Design principle

Do not build a finance dashboard and a separate chatbot.

Build one operating surface where:

**Data + Workflow + Agent + Approval + Audit** coexist.
