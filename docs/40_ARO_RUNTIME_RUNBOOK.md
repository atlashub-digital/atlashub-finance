# ARO Runtime Runbook (E6 handoff — Infrastructure)

Owner: Helena / Infrastructure. Engineering ships the image, migration and manifests; Infrastructure deploys, provisions secrets, applies the reviewed migration and runs the smoke.

Nothing in this document has been executed against production by Engineering.

## 1. Artifacts

| Artifact | Location |
|---|---|
| Image | `infra/docker/Dockerfile` (build from repo root) |
| Compose fragment | `infra/docker/compose.aro.yml` (`aro-api` on the external `edge` network, behind Caddy) |
| Migration (reviewed before apply) | `infra/migrations/202610150001_aro_v1_additive.sql` — analysis in `docs/39` |
| Migration rollback | `infra/migrations/rollback/202610150001_aro_v1_additive.down.sql` (only before real data) |
| Provider accounts + routes | `infra/projects/atlashub.providers.json` |
| Project manifests | `infra/projects/espelhomeu.json`, `atlas-club.json`, `levelab.json` (LeveLab blocked until priced) |

## 2. Environment

| Variable | Required (prod) | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | |
| `DATABASE_URL` | yes | LOGIN user that is a member of `aro_runtime` (not the owner/service role) |
| `ARO_PUBLIC_BASE_URL` | yes | e.g. `https://aro.atlashub.si`; provider webhook URLs derive from it |
| `ARO_CHECKOUT_SECRET_KEY` | yes | ≥32 random chars. Rotating it invalidates live checkout secrets (in-flight polling) |
| `ARO_OPERATOR_JWT_SECRET` | yes | ≥32 random chars; signs operator/Hermes tokens |
| `ARO_WORKER_ENABLED` | no (default true) | outbox delivery + reconciler loops; safe on several replicas |
| `ARO_CHECKOUT_RATE_LIMIT_PER_MIN` | no (default 30) | per public key + IP, in-memory |
| `LOG_LEVEL` | no (default info) | credential headers are redacted |

Provider and project secrets — resolved from `credential_ref` / `webhook_secret_ref` as `ARO_SECRET_<REF>__<FIELD>`:

| Env name | Value |
|---|---|
| `ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__API_KEY` | PixGo API key |
| `ARO_SECRET_ARO_ATLASHUB_PIXGO_PROD__WEBHOOK_SECRET` | PixGo webhook secret |
| `ARO_SECRET_ARO_ATLASHUB_MISTICPAY_PROD__CLIENT_ID` | MisticPay Access Key `pk_…` (scopes TRANSACTION_CREATE, TRANSACTION_READ only) |
| `ARO_SECRET_ARO_ATLASHUB_MISTICPAY_PROD__CLIENT_SECRET` | MisticPay `sk_…` |
| `ARO_SECRET_ARO_ATLASHUB_STRIPE_PROD__SECRET_KEY` | Stripe restricted/secret key |
| `ARO_SECRET_ARO_ATLASHUB_STRIPE_PROD__WEBHOOK_SECRET` | Stripe endpoint secret `whsec_…` |
| `ARO_SECRET_ARO_ESPELHOMEU_WEBHOOK__SECRET` | ARO → EspelhoMeu webhook signing secret (also given to EspelhoMeu as `ARO_WEBHOOK_SECRET`) |

A missing provider secret makes that provider fail as MISCONFIGURED at create time (router fails over), never a crash.

## 3. First deployment (controlled scope)

1. **Review** `docs/39` and the migration with Engineering. Decide tenant mapping (§5 of docs/39).
2. **Apply migration** with an owner DSN (never from the API process):
   ```bash
   docker run --rm -e DATABASE_URL="$OWNER_DSN" aro-api:<sha> node dist/migrate-cli.js
   ```
3. Run Supabase security + performance advisors; record output privately.
4. **Create the runtime login**:
   ```sql
   CREATE ROLE aro_api LOGIN PASSWORD '<generated>' IN ROLE aro_runtime;
   ```
5. **Register configuration** (owner DSN):
   ```bash
   docker run --rm -e DATABASE_URL="$OWNER_DSN" -v "$PWD/infra/projects:/m:ro" aro-api:<sha> \
     node dist/admin-cli.js apply-providers /m/atlashub.providers.json
   docker run --rm -e DATABASE_URL="$OWNER_DSN" -v "$PWD/infra/projects:/m:ro" aro-api:<sha> \
     node dist/admin-cli.js apply-project /m/espelhomeu.json
   ```
6. **Issue EspelhoMeu keys** (printed once; store in EspelhoMeu's secret store):
   ```bash
   node dist/admin-cli.js issue-key espelhomeu public   # ARO_PUBLIC_KEY
   node dist/admin-cli.js issue-key espelhomeu server   # ARO_SERVER_KEY
   ```
7. **Provider dashboards**: PixGo webhooks are set per payment by ARO (`<base>/v1/webhooks/providers/pixgo`). MisticPay `projectWebhook` likewise. Stripe: create endpoint `<base>/v1/webhooks/providers/stripe` for `payment_intent.*`, `charge.refunded`, `charge.dispute.created`. If MisticPay IP allowlisting is enabled, add the VPS egress IP.
8. **Deploy** `aro-api` (compose fragment) and route `aro.atlashub.si` via Caddy.

## 4. Smoke

```bash
curl -fsS https://aro.atlashub.si/health
# → {"status":"ok","service":"aro-api","version":"…","db":"up"}
```

`status: degraded` / `db: down` means the API is up but the database is unreachable.

Synthetic API smoke (no money moves):
- `POST /v1/checkout-sessions` with an unknown offer → `422 INVALID_OFFER` (proves auth + DB + offer lookup);
- `POST /v1/webhooks/providers/pixgo` with an invalid signature → `400`.

The first real-money step is the E7 pilot (`docs/41`).

## 5. Operations

- **Logs**: JSON (pino). Each response has `x-request-id`. Credentials and provider signatures are redacted; payer document is never logged or stored.
- **Stuck PENDING**: the reconciler re-reads provider truth every 60 s for attempts idle > 2 min (3-day window).
- **Project webhook failures**: `aro_webhook_delivery` (`status`, `attempts`, `lastStatusCode`, `lastError`). Retries back off 30 s → 6 h; dead after 12 attempts. Replay:
  ```bash
  node dist/admin-cli.js replay-event <event-id>
  ```
- **Provider incident**: set the account `status` to `disabled` in `atlashub.providers.json` and re-apply → routing skips it and fails over; no deploy needed.
- **Key rotation**: `issue-key` the new key, roll it to the project, then `revoke-key <prefix>`.
- **Exceptions to watch** (`aro_payment_attempt."errorCode"`): `AMOUNT_MISMATCH` (provider paid a different amount; no grant), `DUPLICATE_PAYMENT` (two providers confirmed one order; refund one manually), `UNKNOWN` state older than a few minutes (ambiguous create not yet resolved).
- **MisticPay MED (PIX special return)** events are recorded in `billing_webhook_event` with `normalizedType = PROVIDER_RISK_EVENT` and are not applied automatically in V1.

## 6. Rollback

| Situation | Action |
|---|---|
| Bad image | Redeploy previous image tag. Schema is backward compatible with V1 images. |
| Provider misbehaving | Disable the provider account (see §5); traffic fails over. |
| Stop all sales | Set `aro_project_config.status = 'disabled'` for the project (keys stop authenticating), or deactivate routes. Existing entitlements keep resolving only while the project is active — prefer deactivating routes to keep access checks working. |
| Migration problem before any real order | Apply the rollback script (owner DSN). |
| After real orders exist | Do not drop tables; disable routes/projects and fix forward. |

## 7. Not covered in V1

Ledger/settlement/reconciliation exceptions, provider health telemetry table, Telegram/Discord Phase 0 notifications (can be added as an outbox consumer without touching the payment path).
