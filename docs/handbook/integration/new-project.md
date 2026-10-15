# New Project Integration

This is the standard path for connecting any AtlasHub digital project (eBook, course, community, download, bundle) to ARO.

## Division of work (V1)

| ARO operations (Infrastructure) | Project team |
|---|---|
| Owns the project catalog file in the ARO repository | Receives the approved offer codes and entitlement keys |
| Validates and syncs it into ARO | Builds checkout UI against the ARO API |
| Issues the project's public key, server key and webhook secret | Verifies ARO webhooks and resolves entitlements server-side |
| Configures providers and routing | Never touches provider credentials, the catalog DB or `admin-cli` |

In V1 the catalog lives only in the ARO repository (`infra/projects/<project>/`). Project repositories do **not** copy, own or sync a manifest.

## Steps

1. **Request registration.** Fill the [Project Handoff Template](../reference/project-handoff-template.md): products, offers (market, currency, amount in minor units), entitlement keys, fulfillment, allowed browser origins and webhook URL.
2. **ARO operations register the catalog** (see [Product & Offer Catalog](catalog.md)) and issue keys (see [Authentication](authentication.md)).
3. **Configure the project** with five variables:
   ```
   ARO_API_URL=
   ARO_PROJECT_SLUG=
   ARO_PUBLIC_KEY=        # browser-safe, origin-allowlisted
   ARO_SERVER_KEY=        # server only
   ARO_WEBHOOK_SECRET=    # verifies ARO → project webhooks
   ```
4. **Checkout:** `POST /v1/checkout-sessions` with an offer code and an `Idempotency-Key` → render the PIX QR or card form → poll `GET /v1/checkout-sessions/{id}`. See [Checkout Sessions](../api/checkout-sessions.md).
5. **Webhook (optional, recommended):** receive signed events at your endpoint and deduplicate by event id. See [Webhooks](../api/webhooks.md).
6. **Access:** before serving protected content, call `POST /v1/entitlements/resolve` from your server. See [Entitlements](../api/entitlements.md).
7. **Prove it:** one controlled real payment, approval, access, duplicate event, refund/revoke — see the [Production Checklist](../operations/production-checklist.md).

## Definition of integrated

```
offer → ARO checkout → payment APPROVED → order APPROVED → entitlement ACTIVE → content unlocked
```

…and switching the payment provider requires no change in the project.

## Reference code

- [`examples/typescript/aro-checkout-client.ts`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/typescript/aro-checkout-client.ts)
- [`examples/typescript/verify-aro-webhook.ts`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/typescript/verify-aro-webhook.ts)
- [`examples/typescript/resolve-entitlements.ts`](https://github.com/atlashub-digital/atlashub-finance/blob/main/examples/typescript/resolve-entitlements.ts)
