# Standard New Project Instruction — Commerce from Day Zero

Give this instruction to CODEX / Claude Code at project creation:

> This project uses **ARO — Atlas Revenue Operations** for catalog, checkout, payments, subscriptions and purchase-derived entitlements.
>
> Canonical ARO documentation:
> `atlashub-digital/atlashub-finance`
>
> Start with:
> - `docs/developer/START_HERE.md`
> - `docs/developer/PROJECT_COMMERCE_BOOTSTRAP.md`
> - `docs/developer/INTEGRATION_RECIPES.md`
> - `openapi/aro-v1.yaml`
>
> Create an `aro.project.yaml` in this project using:
> `examples/manifests/training-platform.yaml`
> and validate it against:
> `schemas/project-commerce-manifest.schema.json`.
>
> Define all products, offers, prices, currencies, entitlements and fulfillment mappings there.
>
> The project must not create provider-specific payment logic or provider credentials.
>
> Checkout must reference registered ARO offer codes only.
>
> Protected content must resolve ARO entitlements server-side.
>
> If this project includes Telegram/community access, follow:
> `docs/developer/FULFILLMENT_TELEGRAM.md`.
>
> If ARO runtime is not yet available in this environment, implement against mocks/contract tests and keep the same public contract.
