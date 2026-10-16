# Environments

| Environment | Project | ARO | Providers | Purpose |
|---|---|---|---|---|
| local / CI | dev server | contract mocks or a local ARO with provider simulators | none | coding and tests |
| controlled | preview / staging | ARO production with a project not yet public | real, low-value | integration proof |
| production | production domain | ARO production (`https://aro.atlashub.si`) | real | sales |

PixGo and MisticPay have **no sandbox**. Integration proof uses small real payments (PixGo minimum R$ 10,00).

## Variables

Same five names in every environment; values differ and are provisioned by Infrastructure:

```
ARO_API_URL  ARO_PROJECT_SLUG  ARO_PUBLIC_KEY  ARO_SERVER_KEY  ARO_WEBHOOK_SECRET
```

| Variable | Browser | Project server | ARO only |
|---|:-:|:-:|:-:|
| `ARO_PUBLIC_KEY` | ✓ | ✓ | |
| `ARO_SERVER_KEY`, `ARO_WEBHOOK_SECRET` | | ✓ | |
| Provider credentials, DB credentials, signing keys | | | ✓ |

## Rules

- A project can prepare its integration against mocks before ARO keys exist; do not add temporary provider code.
- Promoting a project to production is a configuration change, not a payment-code rewrite.
