# Fulfillment Recipes

Fulfillment is what the project does after an entitlement becomes active (open a Reader, unlock lessons, send a Telegram invite). It **consumes** ARO entitlements; it never decides payment.

**Money truth and delivery truth are separate.** If fulfillment fails (e.g. Telegram is down), the payment stays `APPROVED` and the entitlement `ACTIVE`; the project retries delivery.

Every recipe follows the same pattern:

```
entitlement.granted webhook (fast path)  ─┐
                                          ├─► project grants access
POST /v1/entitlements/resolve (authority) ┘
entitlement.revoked webhook               ──► project removes access
```

## eBook / WebReader

```
offer: rsp-volume-01-br        entitlement: rsp:ebook:volume-01
```
Reader routes call `entitlements/resolve` server-side before serving content.

## Video course

```
offer: levelab-reset21-br      entitlement: levelab:course:reset21
```
Prefer one top-level entitlement; use module-level keys only if the commercial model sells modules.

## Bundle / collection

```
offer: colecao-br  →  espelhomeu:p01 … espelhomeu:p05
```
One approved order grants several entitlements. Never infer bundle ownership from the price.

## Downloads

```
entitlement: mypets:download:starter-pack
```
Validate the entitlement before generating a short-lived signed asset URL.

## Community / Telegram / WhatsApp

```
offer: course-a-br  →  academia-x:course:course-a, academia-x:telegram:students
```

The community automation:

- deduplicates ARO event ids (the same `entitlement.granted` twice must not create two invites);
- on `entitlement.granted` creates a one-time invite or approves membership and records the result;
- on `entitlement.revoked` removes or restricts access according to project policy;
- stores only fulfillment facts (customer id, Telegram user id, invite status, timestamps, entitlement key, last event id) — never payment truth.

## Hybrid offer

One offer may grant rights in several modules (`levelab:course:reset21`, `levelab:ebook:guia`, `levelab:community`). Each module owns its own experience.

## Not in V1

- **Memberships / subscriptions:** recurring offers (`cadence: month|year`) are rejected at checkout. Entitlements have no expiry in V1.
- **Free products / lead magnets:** do not create zero-value payments to fake an approval; handle free access outside ARO for now.
