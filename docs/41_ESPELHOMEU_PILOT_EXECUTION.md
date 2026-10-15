# EspelhoMeu Pilot — Execution Checklist (E7) and Project Migration Plan

Status: **ready for execution after E6**. Nothing here has been run with real money.

## 1. EspelhoMeu integration (project side)

EspelhoMeu needs only:

```
ARO_API_URL=https://aro.atlashub.si
ARO_PROJECT_SLUG=espelhomeu
ARO_PUBLIC_KEY=aro_pk_…        # browser-safe, origin-allowlisted
ARO_SERVER_KEY=aro_sk_…        # server only
ARO_WEBHOOK_SECRET=…           # verifies ARO → EspelhoMeu webhooks
```

Changes in the EspelhoMeu repository (PR #30 successor):

1. Replace provider calls with `POST /v1/checkout-sessions` (see `examples/typescript/aro-checkout-client.ts`). Offer slugs: `p01-br` … `p05-br`, `colecao-br`. Send the payer CPF/CNPJ (PixGo requires it; the QR is locked to that document).
2. Render the PIX QR from `payment.qr_payload` (unaltered) and show `payment.copy_paste`.
3. Poll `GET /v1/checkout-sessions/{id}` with `X-ARO-Checkout-Secret`; render the normalized states only.
4. Add `POST /api/aro/webhook` using `examples/typescript/verify-aro-webhook.ts` (raw body, timestamp tolerance, HMAC, dedupe by `X-ARO-Event-Id`).
5. Reader/Library gate: call `POST /v1/entitlements/resolve` server-side before serving protected content. Never unlock from the browser return or from the webhook alone.
6. Remove PixGo/MisticPay/Stripe credentials and provider state machines from the project.

## 2. Pilot run (Engineering + Helena)

| # | Step | Evidence |
|---|---|---|
| 1 | E6 smoke PASS (`docs/40` §4) | health JSON with `db: up` |
| 2 | Checkout P01 from the real sales page (R$11,90) | session id, state `PENDING`, QR rendered |
| 3 | Pay the PIX with the CPF used at checkout | PixGo dashboard shows completed |
| 4 | Session → `APPROVED`; `GET /v1/orders/{id}` → `APPROVED` | API responses |
| 5 | `entitlements/resolve` → `espelhomeu:p01` `ACTIVE` | API response |
| 6 | Reader opens P01 | screenshot |
| 7 | EspelhoMeu webhook received 5 events with valid signatures | project logs (event ids) |
| 8 | Re-send the PixGo webhook (PixGo dashboard / replay) | ARO responds `duplicate`; no new events/entitlements |
| 9 | Refund via PixGo | session/order `REFUNDED`; resolve returns no P01; `entitlement.revoked` received; Reader denies |
| 10 | Fallback drill: disable `pixgo-main`, buy P01 again → MisticPay QR; re-enable | attempt rows show `misticpay` |
| 11 | Collection (optional, R$79,90) grants P01–P05 | resolve response |

Record evidence in Issue #12. PDG approves the sales release after the list is complete.

## 3. Known pilot constraints

- PixGo minimum is R$10,00; all EspelhoMeu offers are above it.
- PixGo and MisticPay have no sandbox: every proof uses small real payments.
- MisticPay does not publish QR expiry; ARO shows 30 min as informational expiry.
- MisticPay is CPF-only in V1 routing; CNPJ payers go to PixGo only.
