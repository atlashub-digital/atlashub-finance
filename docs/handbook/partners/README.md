# Partners & Integrators

ARO can serve projects built by partners and client teams through the same API used by AtlasHub's own products.

## What a partner gets

- A registered project with offers and entitlements in the ARO catalog.
- A public key (browser checkout), a server key and a webhook secret, scoped to that project only.
- PIX (Brazil) and card (international) payments with no provider contract on the partner side.
- Signed event webhooks and an authoritative entitlement API.

## What a partner does not get

- Provider credentials, provider dashboards or routing control.
- Access to the AtlasHub database or other projects' data.
- Ability to set prices from code: price changes are catalog changes reviewed and applied by ARO operations.

## Onboarding

1. Agree commercial terms and the catalog with AtlasHub.
2. Send the [Project Handoff Template](../reference/project-handoff-template.md).
3. ARO operations register the project and issue keys.
4. Integrate following [New Project Integration](../integration/new-project.md).
5. Run the [Production Checklist](../operations/production-checklist.md) with a controlled payment.

## Isolation

Every credential is bound to one project and tenant: cross-project reads return `403`/`404`, and entitlement keys must carry the project's own prefix.

## Status (V1)

Partner onboarding is manual and coordinated by ARO operations. A hosted checkout for partners without their own checkout UI is planned — see [Hosted Checkout](../roadmap/hosted-checkout.md).
