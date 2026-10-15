# ARO Integration Recipes — Digital Content

These recipes normalize how AtlasHub projects map commercial offers to digital fulfillment.

## 1. eBook / WebReader

Example:

```
product: rsp-receitas-volume-01
offer: rsp-receitas-volume-01-br
entitlement: rsp:ebook:volume-01
```

After payment:

```
ARO entitlement ACTIVE
→ allow Reader/download
```

Do not use browser success return as purchase proof.

## 2. Video course / aulas

Example:

```
product: levelab-reset21
offer: levelab-reset21-br
entitlement: levelab:course:reset21
```

Protected course routes resolve entitlement server-side.

Optional granular model:

```
levelab:course:reset21
levelab:course:reset21:module-01
```

Prefer one top-level entitlement unless the commercial model requires module-level rights.

## 3. Community / WhatsApp / Telegram / private group

Example:

```
product: mytrainx-community
offer: mytrainx-community-br
entitlement: mytrainx:community
```

ARO entitlement means commercial right to join.

The project/community automation owns fulfillment:

```
entitlement.granted
→ generate invite / onboarding
```

Revocation:

```
entitlement.revoked
→ project removes access according to community policy
```

Do not store provider payment logic inside the community bot.

## 4. Membership / Club

Example:

```
product: atlas-club-membership
offer: atlas-club-monthly-br
entitlement: atlas-club:membership
cadence: month
```

Membership entitlement may include expiry/renewal.

Protected member surfaces always check active entitlement.

Subscription lifecycle events may later include:
- subscription.started;
- subscription.renewed;
- subscription.canceled;
- entitlement.revoked.

V1 implementation follows the OpenAPI/contract capabilities actually released.

## 5. Bundle / Collection

Example:

```
offer: espelhomeu-collection
grants:
  - espelhomeu:p01
  - espelhomeu:p02
  - espelhomeu:p03
  - espelhomeu:p04
  - espelhomeu:p05
```

One approved order may grant multiple entitlements.

The project does not infer bundle ownership locally from price.

## 6. Digital download pack

Example:

```
entitlement: mypets:download:starter-pack
```

Download endpoint must validate entitlement before generating or returning protected asset URL.

Prefer expiring/signed asset URLs when applicable.

## 7. Hybrid offer

Example:

```
offer: levelab-premium
grants:
  - levelab:course:reset21
  - levelab:ebook:guia
  - levelab:community
```

ARO owns the purchase-derived entitlement set.

Each project module owns how that entitlement becomes user experience.

## 8. Free product / lead magnet

Free access does not need to create a fake paid payment.

Possible models:
- CRM/lead event + entitlement;
- separate free-access service;
- ARO zero-value offer only if explicitly supported by the released contract.

Do not fake an APPROVED payment.

## Naming convention

Recommended entitlement key:

```
<project>:<type>:<resource>
```

Examples:

```
rsp:ebook:volume-01
levelab:course:reset21
mypets:community
mytrainx:course:starter
atlas-club:membership
```

For mature existing projects, preserve compatible keys rather than renaming purely for style.
