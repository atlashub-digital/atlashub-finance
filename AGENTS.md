# AGENTS.md — ARO V1

## Source of truth

- `main` = ARO Foundation V1
- `feat/aro-v1-backend` = active implementation branch
- Issue #12 = execution mission
- `openapi/aro-v1.yaml` = API contract

## Rule

Do not redesign ARO inside implementation work.

If a contract gap is found, document it explicitly before changing behavior.

## Priority

1. runnable API;
2. AtlasHub data-plane integration;
3. PixGo;
4. orders/payments;
5. entitlements;
6. signed project webhooks;
7. EspelhoMeu real PIX;
8. LeveLab + Atlas Club reuse proof.

## Non-blockers for V1

- full dashboard;
- full Hermes agent;
- blockchain;
- AI routing;
- advanced BI;
- complete finance ledger;
- every currency/provider.

## Operational ownership

Claude Code/Codex builds.
Helena deploys and operates.
PDG approves release.
