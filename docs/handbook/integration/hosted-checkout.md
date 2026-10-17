# ARO Universal Hosted Checkout V1 — PIX

**State:** draft PR; never assume deployed or commercially live until E2E.

## Ownership

- **Origin project:** editorial/product catalog, offer choice, sales page and business reference, customer eligibility, fulfillment, campaign attribution, customer service.
- **ARO:** active offer and immutable price from canonical catalog, payment methods/provider routing, order, webhook, entitlement.
- **Central CRM/Atendimento.Center:** pre-sale leads and relationships; ARO stores the transactional contact and emits project events. Opt-in for marketing is separate.
- This V1 deliberately **does NOT create arbitrary products or accept `amount_minor` from the buyer**.

## Creating a reusable checkout URL (project backend only)

Register an active offer in ARO operations: `infra/projects/<project>/aro.project.yaml`. Never send project keys to the browser.

```http
POST /v1/checkout-links
Authorization: Bearer <ARO_PROJECT_SERVER_KEY>
Content-Type: application/json

{
  "offer": "p01-br",
  "reference": "CAMPAIGN-P01-IG",
  "expires_in_days": 7
}
```

ARO checks that the offer is ACTIVE and PIX/BRL/once, reads price server-side, and returns:

```json
{
  "project": "espelhomeu",
  "offer": "p01-br",
  "reference": "CAMPAIGN-P01-IG",
  "amount": {"amount_minor":1190,"currency":"BRL"},
  "url": "<ARO_PUBLIC_BASE_URL>/pay/<opaque-token>",
  "expires_at": "<ISO_8601>"
}
```

Use this URL **directly in WhatsApp**. It opens a hosted checkout page, not a popup inside WhatsApp.

## Adding the same checkout in any approved website

Include a small loader hosted by the ARO and open the link:

```html
<script src="https://<ARO_HOST>/assets/aro-checkout.js"></script>
<button type="button" id="buy">Pagar com Pix</button>
<script>
  document.getElementById("buy").addEventListener("click", () => {
    window.AROCheckout.open({
      url: "<ARO_CHECKOUT_URL_FROM_YOUR_BACKEND>",
      onStatus: state => console.log("Pix state:", state)
    });
  });
</script>
```

The project must register its origin in ARO's `allowed_origins`. Payment screen is ARO-hosted, iframe `frame-ancestors` restricts projects, `postMessage` events are only for UX. **The project must verify ARO status/entitlement on its backend before fulfillment.**

## Native UI details

The hosted page asks payer name, email, phone (WhatsApp) and CPF/CNPJ. It displays canonical amount/product, QR SVG built server-side from the provider's original PIX payload, Copia e Cola and polling. `checkout_secret` is per session in browser `sessionStorage`; no payer data or session secret is put in the URL. Closing iframe does not cancel payment. A payment link stays reusable until expiry or offer deactivation.

## Extending the catalog

- **Stable eBook/course/workshop:** sync/update `aro.project.yaml` under reviewed ARO operations; project links use canonical offer IDs. ARO does **not** auto-register new products when a buyer clicks.
- **Custom service invoices:** add a separate **server-to-server draft quote/invoice endpoint**, using a project server key scoped to merchant/store, currency limits, immutable quote snapshot, expiry and audit trail. Do not overload `metadata` or allow browser-provided price. Not implemented in V1.
- **CARD:** contract already supports card payments when routed; hosted Pix UI still needs a card presentation integration. **Boleto is not supported in ARO V1**.

## Deploy checks (Helena)

1. Reconcile real catalog against `atlashub-finance/infra/projects`; keep all unapproved offers in draft. V1 links are generated only for active ones.
2. Preview deploy ARO backend with `/v1/checkout-links`, `/pay/*` and `/assets/*` proxied via HTTPS, `ARO_PUBLIC_BASE_URL` correct, signing key persistent and project origin allowlist updated.
3. Run controlled Pix test: create link → mobile standalone + iframe → PIX Copia/Cola and QR → APPROVED → entitlement ACTIVE → project's fulfillment → CRM/Clara. Test duplicate webhook and refunds; retry failed/expired without duplicate charges.
4. Only then enable commercial traffic. Do not turn off pre-existing EspelhoMeu/AtlasHub payment flows before matching behavior.

