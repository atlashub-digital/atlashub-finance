# Golden Reference — EspelhoMeu

EspelhoMeu is the first ARO project and the reference integration every other project copies.

## Catalog (canonical file: `infra/projects/espelhomeu/aro.project.yaml`)

| Offer code | Grants | Amount | Method |
|---|---|---|---|
| `p01-br` | `espelhomeu:p01` | 1190 BRL (R$ 11,90) | PIX |
| `p02-br` | `espelhomeu:p02` | 1990 BRL | PIX |
| `p03-br` | `espelhomeu:p03` | 2990 BRL | PIX |
| `p04-br` | `espelhomeu:p04` | 2490 BRL | PIX |
| `p05-br` | `espelhomeu:p05` | 2990 BRL | PIX |
| `colecao-br` | `espelhomeu:p01` … `espelhomeu:p05` | 7990 BRL | PIX |

Jornada and Membership are not sold until their fulfillment is ready.

## Project configuration

```
ARO_API_URL=https://aro.atlashub.si
ARO_PROJECT_SLUG=espelhomeu
ARO_PUBLIC_KEY=aro_pk_…        # allowed origin: https://espelho.lia.doctor
ARO_SERVER_KEY=aro_sk_…        # server only
ARO_WEBHOOK_SECRET=…           # webhook: https://espelho.lia.doctor/api/aro/webhook
```

## Flow

```
Sales page (P01)
→ POST /v1/checkout-sessions  { offer: "p01-br", payment_method: "PIX", payer: {…, document} }
→ render QR from payment.qr_payload, show copy_paste
→ poll GET /v1/checkout-sessions/{id} (X-ARO-Checkout-Secret) until APPROVED
→ (in parallel) webhook entitlement.granted at /api/aro/webhook
→ Reader route: POST /v1/entitlements/resolve → "espelhomeu:p01" ACTIVE → open
```

## Implementation checklist (EspelhoMeu repository)

1. Replace provider calls with `POST /v1/checkout-sessions` (see `aro-checkout-client.ts`). Always send the payer CPF/CNPJ.
2. Render the PIX QR from `payment.qr_payload` unaltered; show `payment.copy_paste`.
3. Poll the session with the checkout secret; render normalized states only.
4. Add `POST /api/aro/webhook` with `verify-aro-webhook.ts` (raw body, timestamp, HMAC, dedupe).
5. Gate Reader/Library with `POST /v1/entitlements/resolve` server-side.
6. Remove provider credentials and provider state machines from the project.

EspelhoMeu does not copy or sync the catalog file (V1 rule).

## Acceptance (pilot E7)

P01 R$ 11,90 → PIX → paid → session `APPROVED` → order `APPROVED` → `espelhomeu:p01` `ACTIVE` → Reader opens → duplicate webhook harmless → refund → access revoked. The internal execution checklist with evidence fields is `docs/41_ESPELHOMEU_PILOT_EXECUTION.md`.
