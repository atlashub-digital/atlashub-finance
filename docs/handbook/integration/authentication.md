# Authentication & Project Keys

ARO uses four credentials. Every one is scoped to a single project (operator tokens to a set of projects).

| Credential | Header | Where it may live | Allows |
|---|---|---|---|
| **Public key** `aro_pk_…` | `X-ARO-Public-Key` | browser or server | `POST /v1/checkout-sessions` only |
| **Server key** `aro_sk_…` | `Authorization: Bearer …` | server only | `GET /v1/orders/{id}`, `POST /v1/entitlements/resolve` |
| **Checkout secret** `aro_cs_…` | `X-ARO-Checkout-Secret` | the buyer's browser session | `GET /v1/checkout-sessions/{id}` for that one session |
| **Operator token** (JWT HS256) | `Authorization: Bearer …` | Atlas WorkForce / Hermes | operator read endpoints, by project and scope |

## Public key

- Bound to one project: the request's `project` must equal the key's project, otherwise `403 FORBIDDEN`.
- If the request carries an `Origin` header, it must be in the project's allowed origins (`403` otherwise). Server-to-server calls without `Origin` are accepted.
- Rate limited per key + client IP (default 30 requests/minute; `429 RATE_LIMITED`).
- CORS preflight is answered only for allowlisted origins.

## Server key

Never ship it to a browser or a mobile app. A server key from project A cannot read project B's orders (`404`) or entitlements (`403`).

## Checkout secret

Returned in the checkout session response. Keep it in memory or session storage for polling; do not log it. It is derived per session, so an idempotent replay of the create request returns the same secret.

## Webhook secret

Not an API credential: it verifies the signature of webhooks ARO sends to the project. See [Webhooks](../api/webhooks.md).

## Issuance and rotation (ARO operations)

```bash
node dist/admin-cli.js issue-key <project> public    # printed once
node dist/admin-cli.js issue-key <project> server    # printed once
node dist/admin-cli.js revoke-key <key-prefix>
```

ARO stores only a SHA-256 hash of each key. To rotate: issue a new key, deploy it to the project, then revoke the old prefix.

## Operator tokens

Claims: `sub`, `projects` (list or `*`), `scopes` (e.g. `revenue:read`), `exp`. A token without the scope or project gets `403`. Operator tokens never authorize money movement (see the Hermes tool contract, `docs/36_HERMES_TOOL_CONTRACT_V1.md`).
