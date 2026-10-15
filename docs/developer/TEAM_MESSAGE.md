# Standard Message to Project Engineering Teams

Use this text when handing ARO integration to CODEX, Claude Code or another engineering instance.

> Integrate this project with **ARO — Atlas Revenue Operations**.
>
> Canonical engineering source:
> `atlashub-digital/atlashub-finance`
>
> Start with:
> `docs/developer/START_HERE.md`
>
> API contract:
> `openapi/aro-v1.yaml`
>
> Do not integrate PixGo, MisticPay, Stripe or another provider directly in this project.
>
> Fill `docs/developer/PROJECT_HANDOFF_TEMPLATE.md` for this project and implement against the normalized ARO checkout, webhook and entitlement contracts.
>
> Use `docs/developer/ACCEPTANCE_CHECKLIST.md` as the Definition of Done.
>
> If ARO production is not yet available, prepare the integration with mocks/contract tests; do not create temporary provider-specific production logic.
>
> Report only:
> 1. project manifest/offers/entitlements;
> 2. files changed;
> 3. tests;
> 4. blockers that require ARO/infrastructure action.
