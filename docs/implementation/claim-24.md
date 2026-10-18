# Hosted checkout claim — issue #24

## Contract gap recorded before implementation

The existing hosted checkout returns a session secret but defines no short-lived
proof exchange. EspelhoMeu PR #33 (`feat/access-v1-supabase-integration`,
`apps/api/src/access/claim.ts`, commit `dabc2e49171cc8f23e6e70ddfdb60fe89b3eaab5`, inspected 2026-10-18) proposes a camelCase exchange
with integer epoch milliseconds. This additive contract adopts that shape.

- POST `/v1/checkout-sessions/{id}/claim-proof`, body `{}` and
  `X-ARO-Checkout-Secret`: returns `{ project, orderId, checkoutSessionId, offerId, proof, issuedAt, expiresAt }` only for an
  approved hosted session with current entitlements. The existing checkout secret
  proves possession; it is never placed in a URL. Proof lifetime is 120 seconds.
- POST `/v1/checkout-claims`, Bearer `ARO_CLAIM_SERVER_KEY`, body
  `{ project, orderId, checkoutSessionId, proof, offerId, principalId }`.
  The configured key must also be an active ARO server API key for that project;
  it therefore works for the consumer's subsequent order and entitlement reads.
  `offerId` is the ARO offer UUID (not the offer slug). `principalId` is supplied
  exclusively by the authenticated project backend from its authenticated user.
- Successful exchange returns those binding fields except proof, plus
  `aroCustomerId`, `orderStatus: APPROVED`, `entitlementStatus: ACTIVE`,
  `issuedAt`, `expiresAt` (epoch milliseconds, lifetime <=120 seconds).
- The HMAC proof is domain-separated and signed with the scoped claim key;
  it binds project/tenant/session/order/offer/customer and time. Proofs can be
  refreshed before exchange, but the session can be consumed only once, even
  for another principal or a freshly minted proof. Consumption and audit commit
  together. A lost response requires operator investigation, never a blind retry.
- Invalid authentication is 401; wrong scope/possession/proof is 403; unpaid,
  reversed, expired entitlement or replay is 409. Neither response nor audit
  carries payer PII, checkout secret or proof.
- Endpoints are opt-in with hosted checkout and the claim key. Configured base
  URL and request transport must be HTTPS; HTTP is permitted only in test mode
  for 127.0.0.1. Proxy TLS termination relies on the existing trusted ingress;
  ingress must overwrite forwarded headers and prevent direct public API access.

Hosted provenance uses a server-owned session flag, never caller-supplied metadata.
Sessions created before this migration are ineligible; no retroactive trust is granted.

## Operational gates

Helena reviews/applies the additive migration and provisions an existing scoped
project server key as ARO_CLAIM_SERVER_KEY on ARO and the consumer backend.
Wire proof handoff in the hosted buyer flow using a POST body/in-memory channel,
never a URL or browser storage. Browser UI wiring and consumer activation remain
release gates; no automatic redirect or payment activation is introduced here.
PDG approves release. No production infrastructure or real payments are involved.

## Validation

`pnpm lint` validates whitespace, OpenAPI and documentation links/contracts.
TypeScript validation is separate (`pnpm typecheck`). Integration tests use only
local PostgreSQL and simulated providers, including the pinned consumer adapter.
Reader UI, OTP on a new device, production ingress and release smoke remain gates
for the joint rollout; they are not claimed as verified by the issuer tests.
