# Instruction for Project Engineering Agents

Give this text to CODEX / Claude Code / an engineer when a project integrates ARO.

> This project uses **ARO — Atlas Revenue Operations** for checkout, payments and purchase-derived entitlements.
>
> Documentation: the ARO Developer Handbook (`atlashub-digital/atlashub-finance`, `docs/handbook/`). API contract: `openapi/aro-v1.yaml`.
>
> - Do not integrate PixGo, MisticPay, Stripe or any provider directly; no provider credentials in this project.
> - The catalog (offers, prices, entitlements) is owned by ARO in `infra/projects/<project>/` of the ARO repository. Do not create or sync a manifest here; use the offer codes and entitlement keys you were given.
> - Checkout references registered offer codes only and sends an `Idempotency-Key`.
> - Verify ARO webhooks (raw body, timestamp, HMAC, dedupe) and resolve entitlements server-side before granting access.
> - Telegram/community access consumes entitlement events; it never decides payment.
> - If ARO keys are not available yet, build against mocks/contract tests with the same contract; no temporary provider code.
>
> Definition of done: the Production Checklist. Report: offers/entitlements used, files changed, tests, and any blocker needing ARO operations.
