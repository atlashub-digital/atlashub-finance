# Future Rails — Open Banking, Stablecoins & Blockchain

## Position

Blockchain is a possible future payment/settlement rail inside ARO.

It is **not** a product identity and is not part of the EspelhoMeu launch critical path.

ARO remains provider/rail agnostic.

## Potential future uses

- stablecoin settlement;
- cross-border treasury;
- B2B settlement;
- programmable payouts;
- on-chain payment acceptance;
- proof/audit anchors;
- tokenized access only where commercially justified.

## Architecture rule

A blockchain rail is simply another adapter behind the same contracts:

```
ARO Payment Router
  → PIX adapter
  → Card/PSP adapter
  → Open Banking adapter
  → Stablecoin adapter
  → Blockchain settlement adapter
```

Projects must not become blockchain-aware unless the user-facing product requires it.

## Canonical normalization

On-chain specifics remain provider metadata:

- network;
- chain id;
- token;
- transaction hash;
- confirmations;
- wallet address.

ARO canonical state remains:

- payment attempt;
- payment;
- amount/currency;
- status;
- order;
- entitlement;
- ledger entry;
- settlement.

## Security

Future crypto/stablecoin operations require a separate control plane for:

- custody;
- key management;
- wallet policy;
- allowlists;
- sanctions/compliance;
- chain finality;
- reorg handling;
- treasury approval.

Hermes must never have unrestricted private-key access.

## Launch posture

No blockchain component should be implemented merely because it may be useful later.

The current architecture only needs to remain extensible enough that a new rail can be added without changing project checkout contracts.

## Principle

**Future-ready, not future-burdened.**
