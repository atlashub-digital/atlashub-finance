# ARO Integration Playbook

## Purpose

Standard procedure for connecting an AtlasHub project to ARO without provider coupling.

## Project onboarding

A project integration must define:

- tenantId;
- projectId / project slug;
- legal/billing entity reference;
- default market/currency;
- products;
- offers;
- entitlement keys;
- allowed payment methods;
- routing rules;
- checkout domains;
- webhook/return domains;
- support contact;
- refund policy reference.

## Project contract

Project frontend sends only canonical ARO concepts:

```
project
offer
market
country
currency
payment_method
payer
bump_offers
attribution
```

It must never send:
- provider API keys;
- provider merchant secrets;
- internal provider routing priority;
- arbitrary entitlement keys.

## Integration sequence

1. register/resolve Tenant + Project;
2. register products/prices/offers;
3. define entitlement mapping;
4. configure provider accounts;
5. configure payment routes;
6. integrate checkout-session API;
7. integrate status/entitlement resolution;
8. run test/controlled payment;
9. verify refund/revoke;
10. enable release flag.

## Fast launch pattern

A project may keep its branded checkout UI while ARO owns:
- route resolution;
- payment creation;
- normalized states;
- webhook trust;
- order/payment authority;
- entitlement decisions.

## Client projects

Client-owned deployments must receive scoped credentials and can only operate on their authorized tenant/project.

No cross-tenant reads or route mutations.
