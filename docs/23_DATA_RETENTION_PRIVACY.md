# Data Retention & Privacy

## Principle

ARO stores the minimum data required for commerce, legal obligations, customer access, fraud/reconciliation and operational analytics.

## Data classes

### Operational identifiers
- project/order/payment/provider refs
- generally durable for audit/reconciliation.

### Payer/customer identity
- name
- email
- CPF/CNPJ when required by the payment rail.

Access restricted to roles that require it.

### Provider payloads
Do not copy full raw payloads into analytics tables.

Prefer:
- normalized facts;
- payload hash;
- bounded encrypted/raw retention only when operationally justified.

### Marketing attribution
UTM/campaign/landing metadata only.

Never store intimate reflections, journals, quiz answers or health/sensitive content in ARO revenue targeting.

## Documents

CPF/CNPJ must:
- never appear in application logs;
- never be used as an analytics dimension;
- be masked in operator UI unless role permits full visibility;
- follow explicit retention policy.

## Deletion

Customer deletion requests must distinguish:
- deletable profile/marketing data;
- legally/audit-required financial records;
- pseudonymizable operational records.

Do not destroy financial evidence where legal retention requires preservation.

## Cross-project isolation

Revenue identity linking across projects requires an explicit AtlasHub policy and lawful basis.

Default: project-scoped commercial context.
