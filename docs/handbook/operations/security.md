# Security

## For project teams

- Never store PixGo, MisticPay or Stripe credentials in a project.
- The **public key** may be in the browser; the **server key** and **webhook secret** never.
- Verify every ARO webhook (timestamp + HMAC, constant-time compare) and deduplicate event ids.
- Grant access only after `POST /v1/entitlements/resolve`; never from a redirect or client flag.
- Do not log payer documents (CPF/CNPJ), checkout secrets or keys.
- Allowlist only your real browser origins; server calls should not send `Origin`.

## What ARO guarantees

| Area | Control |
|---|---|
| Price tampering | amount/currency come from the catalog; the request has no price field |
| Payment proof | `SIGNED` provider webhooks, or `VERIFIED_BY_FETCH` provider re-reads; `UNTRUSTED` events never change money state |
| Amount integrity | an approval whose provider amount differs from the attempt is rejected (`AMOUNT_MISMATCH`) |
| Replay | provider events deduped on `(provider, event id)`; signature timestamps limited to 300 s |
| Idempotency | checkout `project + Idempotency-Key`; provider create `project:order:attempt`; outbound `event + endpoint` |
| Project isolation | every key is bound to one project; cross-project reads return 403/404 |
| Secrets | provider and project secrets resolved from Infrastructure-provisioned environment by reference; never in the database or git |
| Keys at rest | API keys stored as SHA-256 hashes; checkout secrets derived, not stored |
| PII | payer document forwarded to the provider only, never persisted or logged; provider webhook facts stored without customer/payer objects |
| Logs | authorization, key, checkout-secret and provider-signature headers redacted |
| Database | ARO connects as `aro_runtime`; all `aro_*` tables have RLS with no anon/authenticated access |

## Reporting

Security issues go to AtlasHub operational security channels, not public issues (see `SECURITY.md`).
