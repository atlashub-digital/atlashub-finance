# Market, Currency & Payment Intelligence

## Objective

ARO should continuously understand where and how AtlasHub projects can monetize.

This is an intelligence layer above the payment router, not a replacement for providers.

## Dimensions

ARO should eventually model:

- country / region;
- currency;
- payment method;
- provider;
- settlement currency;
- fee;
- FX cost;
- authorization/success rate;
- settlement delay;
- refund/chargeback profile;
- operational health;
- provider restrictions;
- payer requirements.

## Market capability registry

Suggested canonical structure:

```
market
currency
payment_method
provider
capability
min_amount
max_amount
payer_fields
settlement_currency
estimated_fee
settlement_delay
enabled
verified_at
source_ref
```

## Continuous analysis

The ARO Finance Operator may periodically research:

- fastest-growing payment methods;
- local payment rails;
- new supported currencies;
- provider pricing changes;
- acceptance-rate opportunities;
- checkout localization needs;
- FX/settlement alternatives;
- provider concentration risk.

Research produces proposals, not automatic production configuration.

## Multi-currency

Canonical money rules:

1. every monetary amount has currency;
2. amounts use integer minor units where the currency supports them;
3. source amount and settlement amount are distinct;
4. FX rate and timestamp are explicit;
5. conversion fee is explicit;
6. never overwrite original transaction currency.

Example:

```
order:
  amount: 2900
  currency: EUR

payment:
  authorized: 2900 EUR

settlement:
  gross: 2900 EUR
  fx_rate: ...
  settled: ... BRL
  provider_fee: ...
```

## Routing intelligence

Future routing may consider:

- market eligibility;
- payer document;
- currency;
- payment method;
- provider health;
- cost;
- success rate;
- amount;
- settlement timing;
- risk;
- project policy.

V1 remains deliberately simple:
- BR PIX → PixGo/MisticPay;
- international → Stripe.

## Exchange rates

ARO may ingest reference FX rates for:
- reporting;
- normalized portfolio reporting;
- margin analysis;
- settlement reconciliation.

Reference FX does not replace provider settlement FX.

## Output to Atlas WorkForce

The Revenue module may show:

- revenue by currency;
- revenue by country;
- settlement exposure;
- provider concentration;
- payment-method conversion;
- suggested market opportunities;
- routing improvement proposals.

## Principle

**ARO observes many markets, but production routing changes only through governed configuration.**
