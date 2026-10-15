# ARO Glossary

**ARO** — Atlas Revenue Operations.

**Project** — commercial tenant, e.g. EspelhoMeu.

**Product** — fulfillment unit/access right.

**Offer** — priced commercial proposition mapping to products.

**Checkout Session** — one user commercial attempt.

**Order** — provider-independent commercial purchase record.

**Order Item** — immutable item snapshot inside an order.

**Payment Attempt** — one execution attempt against one provider account.

**Payment** — normalized monetary result.

**Provider Account** — configured merchant/account relationship with a PSP/rail.

**Payment Route** — rule that selects a provider account.

**Entitlement** — access right derived from commerce or operator policy.

**Ledger Entry** — append-only operational revenue movement representation.

**Settlement** — provider batch/net settlement reference.

**Reconciliation** — process matching internal and provider financial truth.

**Revenue CRM-lite** — customer/lead context required to understand acquisition and revenue, not a generic sales CRM.

**Finance Operator** — Hermes role that observes and operates ARO within policy bounds.

**Trust Level SIGNED** — webhook cryptographically verified.

**Trust Level VERIFIED_BY_FETCH** — webhook is a signal; provider API is queried before monetary state changes.

**Fast Launch** — minimum reusable production slice, proven by real controlled transaction before broader generalization.
