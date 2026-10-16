# Hosted Checkout (planned — not implemented)

**Status:** roadmap. Nothing on this page exists in ARO V1. The V1 integration model is the project-rendered checkout described in [Checkout Sessions](../api/checkout-sessions.md). Decision record: ADR-017 in `docs/12_DECISION_REGISTER.md`.

## Purpose

Let a project or partner without its own checkout UI send buyers to an ARO-operated payment page: offer summary, payer data, PIX QR or card form, status, and return to the project.

## Domain decision

The public hosted-checkout surface will run on a **separate domain from AtlasHub**, preferably under **`xpay.expert`** (e.g. `checkout.xpay.expert`). It will **not** use `pay.atlashub.si` or any `atlashub.si` subdomain.

Reasons:

- **Brand neutrality** — partners and client projects present a payment page that is not branded as AtlasHub.
- **Isolation** — cookies, CSP and origin policies of the payment surface are separated from AtlasHub applications and the ARO API.
- **Risk containment** — a payment page is a phishing and abuse target; keeping it off the corporate domain limits blast radius and reputation impact.
- **Independent evolution** — the hosted surface can change deployment, CDN and compliance posture without touching `aro.atlashub.si`.

The ARO API itself stays at `https://aro.atlashub.si`.

## Intended shape (to be specified before implementation)

```
Project server → ARO: create checkout session (server key, offer code, return URLs)
ARO → returns hosted URL on xpay.expert
Buyer → hosted page → pays (PIX / card)
Hosted page → redirect to project return URL (informational only)
Project → resolves entitlement with ARO (authority, unchanged)
```

Principles that will not change:

- the hosted page uses the same checkout sessions, catalog and entitlements;
- a return URL never proves payment;
- no provider credentials reach the browser beyond provider-safe client tokens.

## Prerequisites before implementation

1. OpenAPI change (new fields such as return URLs and a hosted URL), reviewed and versioned.
2. Domain registration and DNS/TLS for `xpay.expert` by Infrastructure.
3. Branding/legal pages per merchant of record.
4. Security review (CSP, clickjacking, rate limits, abuse monitoring).

Not before the EspelhoMeu pilot (E7) and the LeveLab/Atlas Club reuse proof (E8) are complete.
