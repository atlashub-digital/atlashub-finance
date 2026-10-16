# ARO Project Integration Contract V1

The project integration contract is normative and consists of:

1. **[`openapi/aro-v1.yaml`](../openapi/aro-v1.yaml)** — paths, headers, schemas, states, event names and error codes.
2. **The ARO Developer Handbook** — the behavioral rules around that contract:

| Contract area | Handbook page |
|---|---|
| Golden rule, responsibilities, project ENV | [New Project Integration](./handbook/integration/new-project.md) |
| Offers, catalog authority, entitlement keys | [Product & Offer Catalog](./handbook/integration/catalog.md) |
| Public key, server key, checkout secret, origins | [Authentication & Project Keys](./handbook/integration/authentication.md) |
| Create/poll checkout, idempotency, states | [Checkout Sessions](./handbook/api/checkout-sessions.md) |
| Order read | [Orders](./handbook/api/orders.md) |
| Outbound events, signature, delivery semantics | [Webhooks](./handbook/api/webhooks.md) |
| Access authority | [Entitlements](./handbook/api/entitlements.md) |
| Multi-currency, money rules | [Architecture](./handbook/getting-started/architecture.md) |
| Integration acceptance | [Production Checklist](./handbook/operations/production-checklist.md) |

The previous long-form text of this document was moved into those pages so that each rule exists in exactly one place.
