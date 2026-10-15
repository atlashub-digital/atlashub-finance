# Concepts & Glossary

| Term | Meaning |
|---|---|
| **Project** | An AtlasHub product line that sells through ARO, addressed by a slug (`espelhomeu`, `atlas-club`). |
| **Product** | What the customer owns (`p01`, `course-a`). |
| **Offer** | How a product is sold: code, market, currency, amount, cadence, payment methods and the entitlements it grants (`p01-br` → 1190 BRL → `espelhomeu:p01`). The checkout always references an offer code. |
| **Bump offer** | An extra offer added to the same checkout/order (max 4). |
| **Entitlement** | A commercial right granted after payment, e.g. `espelhomeu:p01`. Keys are always prefixed with the project slug. |
| **Checkout session** | One purchase attempt by a payer: holds the order, the payment instruction (PIX QR or card client secret) and a normalized state. |
| **Order** | The canonical commercial record with items and amount. |
| **Payment attempt** | One provider charge for an order. An order may have several attempts (failover); at most one is expected to be paid. |
| **Customer** | The payer identity (AtlasHub `crm_contact`); `customer_id` in the API. In V1 it is resolved by e-mail. |
| **Minor units** | Integer amount in the currency's smallest unit: R$ 11,90 → `1190` BRL. |
| **Market** | Commercial market code of an offer (`BR`, `EU`, `US`, `INTL`). |
| **Provider** | External PSP (PixGo, MisticPay, Stripe). Never visible in the project contract. |
| **Trust level** | How ARO trusts a provider event: `SIGNED`, `VERIFIED_BY_FETCH` or `UNTRUSTED`. |
| **Outbox** | Durable table of normalized events that ARO delivers to the project webhook. |

## Normalized states

Checkout session `state`: `CREATED`, `PENDING`, `APPROVED`, `FAILED`, `CANCELED`, `EXPIRED`, `REFUNDED`, `CHARGEBACK`.

Order `status`: `CREATED`, `PENDING`, `APPROVED`, `CANCELED`, `REFUNDED`, `CHARGEBACK` (V1 reports `PENDING` for every unpaid order; `CREATED` is reserved).

Entitlement `status` (in resolve responses): `ACTIVE`. Revoked or expired rights are simply absent.

Provider-specific statuses never appear in project-facing responses.
