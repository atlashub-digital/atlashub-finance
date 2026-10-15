# Manual Refund Operations

V1 has **no refund API**. Refunds are executed by ARO operations in the provider dashboard; ARO observes them and reverses access. Projects never refund directly.

## What happens on a refund

```
provider refund confirmed
→ payment REFUNDED → order REFUNDED → checkout session REFUNDED
→ entitlements of the order revoked
→ webhooks: payment.refunded, entitlement.revoked
→ entitlements/resolve no longer returns the rights
```

Chargebacks follow the same path with `CHARGEBACK` / `payment.chargeback`.

## Procedure

1. **Identify** the order (`order_id` from support, the project's records or `GET /v1/orders/{id}`) and check it is `APPROVED`.
2. **Find the provider payment**: in ARO, `aro_payment_attempt` for that `orderId` with state `APPROVED` gives `provider` and `providerPaymentId`.
3. **Refund in the provider dashboard** — full amount only (partial refunds are not modeled in V1).
4. **Confirm in ARO** within a few minutes: order `REFUNDED`, entitlements gone, `payment.refunded` + `entitlement.revoked` delivered to the project.
5. **Record** the reason in the support ticket.

### PixGo

Refund in the PixGo dashboard → `payment.refunded` webhook → ARO reverses automatically. If the webhook is lost, ARO's reconciler does not re-check approved payments; replay the webhook from PixGo or escalate to Engineering.

### Stripe

Full refund in the Stripe dashboard → `charge.refunded` → ARO reverses automatically. Disputes (`charge.dispute.created`) are applied as `CHARGEBACK`.

### MisticPay

**Known V1 limitation:** MisticPay reports no refund status ARO can observe, so a MisticPay refund leaves the ARO order `APPROVED` and the entitlement `ACTIVE`. Until a supported operator reversal command exists:

- prefer resolving MisticPay disputes without refund where policy allows;
- if a refund is unavoidable, refund at MisticPay and **escalate to Engineering** to apply the reversal through the payment state machine. Never edit `commerce_order` / `commerce_entitlement` rows by hand — that skips events, audit and revocation webhooks.

MED (PIX special return) notices arrive as `INFRACTION` webhooks and are recorded for operators, not applied automatically.

## Duplicate payments

If two providers both confirmed one order, the second attempt is flagged `DUPLICATE_PAYMENT` and grants nothing. Refund that attempt in its provider dashboard; access stays with the first payment.
