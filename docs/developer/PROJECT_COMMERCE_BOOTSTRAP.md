# Project Commerce Bootstrap — Catalog First

## Purpose

This is the standard way a new AtlasHub digital project is connected to ARO from day zero.

It applies to:
- eBooks;
- courses;
- video lessons;
- communities;
- Telegram/WhatsApp groups;
- memberships;
- downloads;
- bundles;
- hybrid digital products.

## Core decision

**Products and offers are registered before checkout.**

A checkout never invents price, currency, product or entitlement.

The project frontend sends only a stable offer code:

```json
{
  "project": "academia-x",
  "offer": "course-a-br",
  "payment_method": "PIX"
}
```

ARO resolves the canonical offer from its central catalog and determines:
- product;
- price;
- currency;
- cadence;
- entitlements;
- allowed markets;
- payment route.

This prevents frontend price tampering and keeps all projects consistent.

## Source of desired configuration vs runtime authority

### Project repository
Each project owns a versioned file:

`aro.project.yaml`

This is the project's **desired commerce configuration**.

It is reviewed in Git with the project code.

### ARO / AtlasHub database
ARO stores the **runtime canonical catalog snapshot** used for checkout.

The DB is authoritative at transaction time.

### Sync

```
Project repo
aro.project.yaml
      ↓
ARO catalog sync
      ↓
AtlasHub central catalog
      ↓
checkout
```

A payment request must never be allowed to create an unknown product/offer ad hoc.

## Why this pattern

It gives:
- version control;
- code review;
- identical behavior across CODEX/Claude teams;
- deterministic deployment;
- no direct DB editing by project developers;
- no provider logic in project repos;
- auditable price changes.

## Initial project flow

When creating a new project:

1. create frontend/backend repo;
2. add `aro.project.yaml`;
3. define products;
4. define offers/prices;
5. define entitlements;
6. define fulfillment actions;
7. submit/review;
8. sync manifest into ARO;
9. frontend consumes ARO offer codes;
10. controlled payment test.

## Price changes

Price changes are configuration changes.

Example:

```
course-a-br:
  3990 BRL
→
  4990 BRL
```

The team changes the manifest, reviews it and syncs it.

The frontend should not hardcode financial authority.

It may display a cached/static price for UX, but checkout authority comes from ARO.

## Product vs Offer

A product is what the customer owns.

Example:

```
product:
  course-a
```

An offer is how that product is sold.

Examples:

```
course-a-br
→ 3990 BRL
→ PIX

course-a-eu
→ 900 EUR
→ CARD
```

Both may grant:

```
academy:course:course-a
```

## Entitlement

An entitlement is the commercial right granted after payment.

Examples:

```
academy:course:course-a
academy:telegram:students
academy:membership:premium
```

ARO owns the entitlement state.

The project owns fulfillment UX.

## Fulfillment

Fulfillment is what happens after an entitlement becomes active.

Examples:
- unlock Reader;
- unlock video route;
- generate download;
- send Telegram invite;
- add member to community;
- create onboarding task.

Fulfillment must consume ARO entitlement events; it must not recreate payment logic.

## Runtime sequence

```
Catalog registered
→ customer selects Course A
→ frontend calls ARO with offer=course-a-br
→ ARO resolves 3990 BRL
→ ARO creates payment
→ provider confirms
→ order APPROVED
→ entitlement(s) ACTIVE
→ ARO emits entitlement.granted
→ project/automation fulfills access
```

## Project DB

A project DB remains optional.

Use it for:
- lesson progress;
- watched videos;
- quizzes;
- profile/preferences;
- local product experience;
- gamification.

Do not duplicate payment/order/subscription authority there.

## Minimum rule for project teams

Project developers may read commerce configuration and call ARO.

They do not:
- write directly to central commerce tables;
- create provider payments directly;
- mark entitlements active;
- decide final price server-side independently of ARO.
